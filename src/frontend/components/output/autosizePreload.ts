import { get } from "svelte/store"
import type { Item, OutSlide } from "../../../types/Show"
import { getItemText } from "../edit/scripts/textStyle"
import { clone } from "../helpers/array"
import { itemHasAutoSize, setTemplateStyle } from "../helpers/output"
import { showsCache } from "../../stores"
import { _show } from "../helpers/shows"

export type AutoSizeTarget = { item: Item; index: number; key: string; slideId: string; showId: string; layoutId: string }

// create a stable identifier for probe + visible textbox coordination (scoped to the slide)
export function createAutoSizeKey(slideId: string | undefined, item: Item, index: number) {
    return `${slideId}:${item?.id || "idx-" + index}`
}

// only items that use the autosize cache (no dynamic text, chords or line limits)
export function canProbeAutoSize(item: Item, currentStyle: any) {
    if (Number(currentStyle?.lines || 0)) return false
    if (!item || !itemHasAutoSize(item) || item.chords?.enabled) return false
    return !getItemText(item).includes("{")
}

export type PreloadShow = { showId: string; layoutId: string; first?: number[]; onlyFirst?: boolean }

// autosize items of the given shows, "first" slides before the rest of the layout
export function buildPreloadQueue(shows: PreloadShow[], skip: { showId: string; index: number } | undefined, currentStyle: any, outputId: string): AutoSizeTarget[] {
    const targets: AutoSizeTarget[] = []

    shows.forEach(({ showId, layoutId, first = [], onlyFirst }) => {
        if (!get(showsCache)[showId]) return
        const layoutRefs: any[] = _show(showId).layouts([layoutId]).ref()[0] || []

        const order = onlyFirst ? [...first] : [...first, ...layoutRefs.map((_a, i) => i)]
        const indexes = [...new Set(order)].filter((i) => !(skip?.showId === showId && skip.index === i) && i >= 0 && i < layoutRefs.length)

        indexes.forEach((i) => {
            const layoutRef = layoutRefs[i]
            if (!layoutRef?.id || layoutRef.data?.disabled) return

            const slide = _show(showId).slides([layoutRef.id]).get()[0]
            if (!slide?.items?.length) return

            const outSlide: OutSlide = { id: showId, layout: layoutId, index: i }
            const items = setTemplateStyle(outSlide, currentStyle, clone(slide.items), outputId, slide.customDynamicValues)
            items.forEach((item, index) => {
                if (canProbeAutoSize(item, currentStyle)) targets.push({ item, index, key: createAutoSizeKey(layoutRef.id, item, index), slideId: layoutRef.id, showId, layoutId })
            })
        })
    })

    return targets
}
