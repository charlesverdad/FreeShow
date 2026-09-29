<script lang="ts">
    import { activePopup, outputs, popupData, styles, websiteMirrors } from "../../../stores"
    import { getResolution } from "../../helpers/output"
    import WebsiteMirror from "../../slide/views/WebsiteMirror.svelte"

    // control the live website on an output with mouse & keyboard (Escape closes)
    const key: string = $popupData.key || ""
    const outputId = key.slice(0, key.indexOf("|"))

    $: resolution = getResolution(null, [$outputs, $styles], false, outputId)

    // the website is no longer live
    $: if (!key || !$websiteMirrors[key]) activePopup.set(null)
</script>

<div class="website" style="aspect-ratio: {resolution.width} / {resolution.height};">
    {#if key}
        <WebsiteMirror {key} control />
    {/if}
</div>

<style>
    .website {
        position: relative;
        width: min(75vw, calc(70vh * 16 / 9));
        max-width: 100%;
        background-color: black;
        overflow: hidden;
    }
</style>
