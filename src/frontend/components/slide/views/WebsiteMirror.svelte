<script lang="ts">
    import { onDestroy } from "svelte"
    import { OUTPUT } from "../../../../types/Channels"
    import { websiteFrames } from "../../../stores"
    import { send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"

    // shows the live website of the output window (single browser instance) in main window previews
    export let key: string

    $: frame = $websiteFrames[key]

    // subscribe to frames (and move the subscription if the key changes)
    let subscribedKey = ""
    $: if (key !== subscribedKey) subscribe(key)
    function subscribe(newKey: string) {
        if (subscribedKey) send(OUTPUT, ["WEBSITE_MIRROR"], { id: subscribedKey, enabled: false })
        subscribedKey = newKey
        if (newKey) send(OUTPUT, ["WEBSITE_MIRROR"], { id: newKey, enabled: true })
    }
    onDestroy(() => subscribe(""))
</script>

<div class="mirror">
    {#if frame}
        <img src={frame} alt="" draggable="false" />
    {:else}
        <div class="waiting">
            <Icon id="web" size={3} white />
        </div>
    {/if}
</div>

<style>
    .mirror {
        position: absolute;
        width: 100%;
        height: 100%;

        pointer-events: none;
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: fill;
        display: block;
    }

    .waiting {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 100%;
        height: 100%;

        background-color: rgb(0 50 100 / 0.3);
        zoom: 8;
    }
</style>
