// Website item helpers (shared by the output window, main window previews and slide controls)

// one live website per output & url
export function getWebsiteKey(outputId: string, src: string) {
    return outputId + "|" + src
}

// same formatting as the website item uses for its url
export function formatWebsiteUrl(src: string) {
    if (!src) return ""
    src = src.replaceAll("&amp;", "&").replaceAll("{", "%7B").replaceAll("}", "%7D")
    if (!src.includes("://")) src = "http://" + src

    try {
        new URL(src)
        return src
    } catch {
        return ""
    }
}

// the (formatted) url of a website item that should receive slide controls
export function findSlideControlsWebsite(items: { type?: string; web?: { src?: string; slideControls?: boolean } }[]) {
    const item = items.find((a) => a?.type === "web" && a.web?.slideControls && a.web?.src)
    return item ? formatWebsiteUrl(item.web!.src!) : ""
}
