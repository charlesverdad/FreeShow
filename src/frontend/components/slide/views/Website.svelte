<script lang="ts">
    import { onDestroy } from "svelte"
    import { currentWindow, outputs } from "../../../stores"
    import Icon from "../../helpers/Icon.svelte"
    import WebsiteMirror from "./WebsiteMirror.svelte"
    import { formatWebsiteUrl, getWebsiteKey } from "./websiteHelpers"
    import { claimWebsite, releaseWebsite } from "./websitePool"

    export let src: string
    export let navigation = true
    export let zoom: number | undefined = undefined
    export let disablePreview = false
    export let outputId = ""

    $: parsedSrc = formatWebsiteUrl(src)

    // OUTPUT WINDOW

    // the website is kept loaded in the output's website pool (so it keeps its state between slides),
    // and placed over this placeholder while the slide is shown
    let placeholder: HTMLElement | undefined
    let claimedSrc = ""
    $: if ($currentWindow === "output" && placeholder && parsedSrc) claim(parsedSrc, zoom, navigation)
    function claim(newSrc: string, _zoom: any, _navigation: boolean) {
        if (claimedSrc && claimedSrc !== newSrc) releaseWebsite(claimedSrc, placeholder!)
        claimedSrc = newSrc
        claimWebsite(newSrc, placeholder!, { zoom, navigation })
    }
    onDestroy(() => {
        if (claimedSrc && placeholder) releaseWebsite(claimedSrc, placeholder)
    })

    // MAIN WINDOW

    // a preview of an active output never loads its own copy (that would be a separate, out of sync session)
    $: mirrorOutputId = !$currentWindow && outputId && $outputs[outputId]?.enabled ? outputId : ""
    $: mirrorKey = mirrorOutputId && parsedSrc ? getWebsiteKey(mirrorOutputId, parsedSrc) : ""

    // local website (e.g. when no output is active)
    let webview: any
    function initWebview(node: HTMLElement) {
        node.addEventListener("dom-ready", setStyle)
        node.addEventListener("did-finish-load", setStyle)

        return {
            destroy() {
                node.removeEventListener("dom-ready", setStyle)
                node.removeEventListener("did-finish-load", setStyle)
            }
        }
    }

    $: if (webview && zoom !== undefined) setStyle()
    function setStyle() {
        if (!webview) return

        try {
            webview.setAudioMuted(true)
            webview.setZoomFactor((parseFloat(zoom?.toString() || "100") || 100) / 100)
        } catch (err) {
            console.debug("Failed to style webview:", err)
        }
    }
</script>

{#if disablePreview}
    <div class="iconPreview">
        <Icon id="web" size={3} white />
    </div>
{:else if $currentWindow === "output"}
    <div class="placeholder" bind:this={placeholder} />
{:else if mirrorKey}
    <WebsiteMirror key={mirrorKey} />
{:else if parsedSrc}
    <div class="website">
        <webview src={parsedSrc} partition="persist:websites" bind:this={webview} use:initWebview />
    </div>
{/if}

<style>
    .placeholder,
    .website {
        position: absolute;
        width: 100%;
        height: 100%;

        pointer-events: none;
    }

    webview {
        width: 100%;
        height: 100%;
    }

    .iconPreview {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
        height: 100%;

        border: 2px solid white;
        background-color: rgb(0 50 100 / 0.3);

        zoom: 8;
    }
</style>
