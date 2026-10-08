import { encodeFilePath, getExtension, getMediaType } from "../helpers/media"

// decoded background images, so they show instantly when the slide changes
const images = new Map<string, HTMLImageElement>()

export function preloadBackgrounds(paths: string[]) {
    // only keep what the current mode wants
    images.forEach((_img, path) => {
        if (!paths.includes(path)) images.delete(path)
    })

    paths.forEach((path) => {
        if (images.has(path) || getMediaType(getExtension(path)) !== "image") return

        const img = new Image()
        img.src = encodeFilePath(path)
        img.decode().catch(() => {})
        images.set(path, img)
    })
}

export const getPreloadedImageCount = () => images.size
