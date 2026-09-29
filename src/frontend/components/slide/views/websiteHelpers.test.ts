import { describe, expect, it } from "vitest"
import { findSlideControlsWebsite, formatWebsiteUrl, getWebsiteKey } from "./websiteHelpers"

describe("websiteHelpers", () => {
    it("keys live websites by output and url", () => {
        expect(getWebsiteKey("out1", "https://canva.com/a")).toBe("out1|https://canva.com/a")
        expect(getWebsiteKey("out1", "https://canva.com/a")).not.toBe(getWebsiteKey("out2", "https://canva.com/a"))
    })

    it("formats website urls like the website item", () => {
        expect(formatWebsiteUrl("canva.com/design/x/view?a=1&amp;b=2")).toBe("http://canva.com/design/x/view?a=1&b=2")
        expect(formatWebsiteUrl("https://example.com/{id}")).toBe("https://example.com/%7Bid%7D")
        expect(formatWebsiteUrl("")).toBe("")
    })

    it("finds the website item that takes slide controls", () => {
        const items = [{ type: "text" }, { type: "web", web: { src: "https://a.com" } }, { type: "web", web: { src: "https://www.canva.com/design/x/view", slideControls: true } }]
        expect(findSlideControlsWebsite(items)).toBe("https://www.canva.com/design/x/view")
        expect(findSlideControlsWebsite([{ type: "web", web: { src: "https://a.com" } }])).toBe("")
        expect(findSlideControlsWebsite([])).toBe("")
    })
})
