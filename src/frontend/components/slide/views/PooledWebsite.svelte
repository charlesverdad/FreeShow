<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { OUTPUT } from "../../../../types/Channels"
    import { outputs } from "../../../stores"
    import { send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"
    import Button from "../../inputs/Button.svelte"
    import { getWebsiteKey } from "./websiteHelpers"
    import type { WebsiteSlot } from "./websitePool"

    // a website kept loaded in the output window, placed over its slide placeholder while shown
    export let website: WebsiteSlot
    export let container: HTMLElement | undefined
    export let ratio = 1

    $: visible = !!website.element
    $: src = website.src

    // POSITION

    let rect = { left: 0, top: 0, width: 0, height: 0 }
    let frame = 0
    onMount(() => {
        const update = () => {
            updateRect()
            frame = requestAnimationFrame(update)
        }
        update()
    })
    onDestroy(() => cancelAnimationFrame(frame))

    function updateRect() {
        if (!website.element || !container) return
        const c = container.getBoundingClientRect()
        const r = website.element.getBoundingClientRect()
        // the output is scaled, so convert back to the container's own coordinates
        const scale = container.offsetWidth ? c.width / container.offsetWidth : 1
        const newRect = { left: (r.left - c.left) / scale, top: (r.top - c.top) / scale, width: r.width / scale, height: r.height / scale }
        if (newRect.left !== rect.left || newRect.top !== rect.top || newRect.width !== rect.width || newRect.height !== rect.height) rect = newRect
    }

    // WEBVIEW

    let webview: any
    let webviewReady = false

    function initWebview(node: HTMLElement) {
        node.addEventListener("dom-ready", onDomReady)
        node.addEventListener("did-finish-load", setStyle)
        node.addEventListener("did-navigate", checkNavigation)

        return {
            destroy() {
                node.removeEventListener("dom-ready", onDomReady)
                node.removeEventListener("did-finish-load", setStyle)
                node.removeEventListener("did-navigate", checkNavigation)
            }
        }
    }

    function onDomReady() {
        webviewReady = true
        attachToOutput()
        checkNavigation()
        setStyle()
        if (visible) focusWebsite()
    }

    $: if (webviewReady) setStyle(website.zoom)
    $: if (webviewReady) setMuted(!visible)

    function setStyle(_updater: any = null) {
        if (!webview || !webviewReady) return
        const factor = (parseFloat(website.zoom?.toString() || "100") || 100) / 100

        try {
            webview.setZoomFactor(factor)
        } catch (err) {
            console.debug("Failed to set webview zoom factor:", err)
        }

        // custom scale does often not work on embeds (Presentations)
        if (src.includes("embed")) return

        webview
            .executeJavaScript(
                `
                if (document.documentElement) document.documentElement.style.zoom = '${factor}';
                if (document.body) {
                    document.body.style.transformOrigin = '0 0';
                    document.body.style.width = '100%';
                    document.body.style.height = '100%';
                }
            `
            )
            ?.catch((err: any) => console.debug("Webview executeJavaScript failed:", err))
    }

    // hidden websites stay loaded, but should not be heard
    function setMuted(muted: boolean) {
        try {
            webview.setAudioMuted(muted)
        } catch (err) {
            console.debug("Failed to mute webview audio:", err)
        }
    }

    function focusWebsite() {
        send(OUTPUT, ["FOCUS"], { id: Object.keys($outputs)[0] })
        setTimeout(() => {
            try {
                webview?.focus()
            } catch (err) {
                console.debug("Webview focus failed:", err)
            }
        })
    }

    // LIVE INSTANCE

    // this is the one live browser instance, main window previews mirror it
    let attachedWebContentsId: number | null = null
    let attachedKey = ""
    function attachToOutput() {
        const outputId = Object.keys($outputs)[0]
        if (!outputId || !webview) return

        try {
            const webContentsId = webview.getWebContentsId()
            const key = getWebsiteKey(outputId, src)
            if (webContentsId === attachedWebContentsId && key === attachedKey) return
            attachedWebContentsId = webContentsId
            attachedKey = key
            send(OUTPUT, ["WEBSITE_ATTACH"], { id: key, webContentsId })
        } catch (err) {
            console.debug("Could not attach website:", err)
        }
    }

    onDestroy(() => {
        if (attachedWebContentsId === null) return
        send(OUTPUT, ["WEBSITE_DETACH"], { id: attachedKey, webContentsId: attachedWebContentsId })
    })

    // NAVIGATION

    let hover = false
    let backDisabled = true
    let forwardDisabled = true
    let url = src

    function navigate(back = true) {
        if (!webview || !webviewReady) return

        try {
            if (back) webview.goBack()
            else webview.goForward()
        } catch (err) {
            console.debug("Webview navigation failed:", err)
        }

        setTimeout(checkNavigation)
    }

    function checkNavigation() {
        if (!webviewReady || !webview) return

        try {
            backDisabled = !webview.canGoBack()
            forwardDisabled = !webview.canGoForward()
            url = webview.getURL() || src
        } catch (err) {
            console.debug("Webview navigation check failed:", err)
        }
    }

    function formatUrl(url: string) {
        url = url.split("://")[1] || url
        url = url.replace("www.", "")
        if (url[url.length - 1] === "/") url = url.slice(0, -1)
        return url
    }
</script>

<div class="website" class:visible style="left: {rect.left}px;top: {rect.top}px;width: {rect.width}px;height: {rect.height}px;" on:mouseover={() => (hover = true)} on:focus={() => (hover = true)} on:mouseleave={() => (hover = false)}>
    {#if website.navigation && hover && visible}
        <div class="controls" style="zoom: {1 / ratio};">
            {#if !backDisabled || !forwardDisabled}
                <Button on:click={() => navigate(true)} disabled={backDisabled}>
                    <Icon id="back" white />
                </Button>
                <Button on:click={() => navigate(false)} disabled={forwardDisabled}>
                    <Icon id="arrow_forward" white />
                </Button>
            {/if}

            <p class="url">{formatUrl(url)}</p>
        </div>
    {/if}
    <webview {src} partition="persist:websites" allowpopups bind:this={webview} use:initWebview />
</div>

<style>
    .website {
        position: absolute;
        pointer-events: none;
        /* keep rendering while hidden (display: none would unload the view) */
        visibility: hidden;
    }
    .website.visible {
        visibility: visible;
        pointer-events: initial;
    }

    webview {
        width: 100%;
        height: 100%;
    }

    .controls {
        z-index: 1;
        position: absolute;
        bottom: 0;
        left: 0;

        background-color: black;
        border-start-end-radius: 3px;
        display: flex;

        opacity: 0.4;
    }
    .controls :global(button) {
        padding: 2px 4px !important;
    }

    .url {
        display: flex;
        align-items: center;
        padding: 2px 10px;
    }
</style>
