import type { Item, OutSlide } from "../../../types/Show"
import { getItemText } from "../edit/scripts/textStyle"
import { clone } from "../helpers/array"
import { itemHasAutoSize, setTemplateStyle } from "../helpers/output"
import { _show } from "../helpers/shows"

export type AutoSizeTarget = { item: Item; index: number; key: string; slideId: string }

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

// autosize items of the other slides in the layout, nearest slides first
export function buildPreloadQueue(outSlide: OutSlide, currentStyle: any, outputId: string): AutoSizeTarget[] {
    const layoutRefs: any[] = _show(outSlide.id).layouts([outSlide.layout]).ref()[0] || []
    const current = outSlide.index ?? 0

    const order = [current + 1, current + 2, current - 1]
    layoutRefs.forEach((_a, i) => order.push(i))
    const indexes = [...new Set(order)].filter((i) => i !== current && i >= 0 && i < layoutRefs.length)

    const targets: AutoSizeTarget[] = []
    indexes.forEach((i) => {
        const layoutRef = layoutRefs[i]
        if (!layoutRef?.id || layoutRef.data?.disabled) return

        const slide = _show(outSlide.id).slides([layoutRef.id]).get()[0]
        if (!slide?.items?.length) return

        const items = setTemplateStyle({ ...outSlide, index: i }, currentStyle, clone(slide.items), outputId, slide.customDynamicValues)
        items.forEach((item, index) => {
            if (canProbeAutoSize(item, currentStyle)) targets.push({ item, index, key: createAutoSizeKey(layoutRef.id, item, index), slideId: layoutRef.id })
        })
    })

    return targets
}
