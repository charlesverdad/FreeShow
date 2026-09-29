import { get } from "svelte/store"
import { OUTPUT } from "../../../types/Channels"
import type { Item } from "../../../types/Show"
import { outputs, overlays, showsCache, websiteMirrors } from "../../stores"
import { send } from "../../utils/request"
import { findSlideControlsWebsite, formatWebsiteUrl, getWebsiteKey } from "../slide/views/websiteHelpers"
import { _show } from "./shows"

// Website items with "Send slide controls to website" enabled (e.g. a Canva presentation)
// take next/previous slide (keyboard, clickers, remote, API) while they are live on an output.
// Returns true if the website handled it.
export function sendSlideControlToWebsite(outputId: string, direction: "next" | "previous"): boolean {
    const src = findSlideControlsWebsite(getLiveItems(outputId))
    if (!src) return false

    const key = getWebsiteKey(outputId, src)
    if (!get(websiteMirrors)[key]) return false

    send(OUTPUT, ["WEBSITE_KEY"], { id: key, keyCode: direction === "next" ? "Right" : "Left" })
    return true
}

function getLiveItems(outputId: string): Item[] {
    const out = get(outputs)[outputId]?.out
    if (!out) return []

    const items: Item[] = []

    const outSlide = out.slide
    if (outSlide?.tempItems) {
        items.push(...outSlide.tempItems)
    } else if (outSlide?.id && outSlide.layout && typeof outSlide.index === "number") {
        const ref = _show(outSlide.id).layouts([outSlide.layout]).ref()[0] || []
        const slideId = ref[outSlide.index]?.id
        items.push(...(get(showsCache)[outSlide.id]?.slides?.[slideId]?.items || []))
    }

    ;(out.overlays || []).forEach((overlayId) => items.push(...(get(overlays)[overlayId]?.items || [])))

    return items
}

// websites on a slide, and their loaded instances on any output (slide context menu)
export function getSlideWebsites(showId: string, layoutIndex: number): { sources: string[]; liveKeys: string[] } {
    const ref = _show(showId).layouts("active").ref()[0] || []
    const slideId = ref[layoutIndex]?.id
    const items: Item[] = get(showsCache)[showId]?.slides?.[slideId]?.items || []
    const sources = items.filter((item) => item.type === "web" && item.web?.src).map((item) => formatWebsiteUrl(item.web.src))

    const liveKeys = Object.entries(get(websiteMirrors))
        .filter(([key, attached]) => attached && sources.some((src) => key.endsWith("|" + src)))
        .map(([key]) => key)
    return { sources, liveKeys }
}
