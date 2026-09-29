// Output window only: websites are kept loaded in a pool (WebsitePool.svelte) instead of inside the slide,
// so leaving a slide and coming back shows the same page, in the same state (e.g. the same Canva slide).
// A website item on the current slide "claims" its url with a placeholder element the pooled website is placed over.

import { writable } from "svelte/store"

export type WebsiteSlot = {
    src: string
    element: HTMLElement | null // placeholder in the slide (null = hidden, kept loaded)
    zoom?: number
    navigation: boolean
    lastUsed: number
}

// hidden websites kept loaded (each can use a lot of memory)
const MAX_HIDDEN = 3

export const websiteSlots = writable<{ [src: string]: WebsiteSlot }>({})

export function claimWebsite(src: string, element: HTMLElement, options: { zoom?: number; navigation: boolean }) {
    if (!src) return
    websiteSlots.update((a) => {
        a[src] = { src, element, zoom: options.zoom, navigation: options.navigation, lastUsed: Date.now() }
        return a
    })
}

export function releaseWebsite(src: string, element: HTMLElement) {
    websiteSlots.update((a) => {
        // another slide might have claimed it already (e.g. during a transition)
        if (!a[src] || a[src].element !== element) return a

        a[src] = { ...a[src], element: null, lastUsed: Date.now() }

        // unload the least recently used hidden websites
        const hidden = Object.values(a)
            .filter((slot) => !slot.element)
            .sort((x, y) => y.lastUsed - x.lastUsed)
        hidden.slice(MAX_HIDDEN).forEach((slot) => delete a[slot.src])

        return a
    })
}
