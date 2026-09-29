<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { OUTPUT } from "../../../../types/Channels"
    import { websiteMirrors } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"
    import Button from "../../inputs/Button.svelte"
    import type { WebsiteInputEvent } from "./websiteInput"
    import { getKeyEvents, getModifiers, getMouseButton, getRelativePosition } from "./websiteInput"

    // shows the live website of the output window (single browser instance),
    // and can forward mouse/keyboard input to it
    export let outputId: string
    export let ratio = 1

    $: frame = $websiteMirrors[outputId]?.frame

    let elem: HTMLDivElement | undefined
    let interacting = false

    onMount(() => {
        send(OUTPUT, ["WEBSITE_MIRROR"], { id: outputId, enabled: true })
    })
    onDestroy(() => {
        stopInteracting()
        send(OUTPUT, ["WEBSITE_MIRROR"], { id: outputId, enabled: false })
    })

    function sendInput(event: WebsiteInputEvent) {
        send(OUTPUT, ["WEBSITE_INPUT"], { id: outputId, event })
    }

    // INTERACTION

    function toggleInteracting() {
        if (interacting) stopInteracting()
        else startInteracting()
    }

    function startInteracting() {
        interacting = true
        window.addEventListener("keydown", keydown, true)
        window.addEventListener("keyup", keyup, true)
        window.addEventListener("mousedown", mousedownOutside, true)
    }

    function stopInteracting() {
        interacting = false
        window.removeEventListener("keydown", keydown, true)
        window.removeEventListener("keyup", keyup, true)
        window.removeEventListener("mousedown", mousedownOutside, true)
    }

    function mousedownOutside(e: MouseEvent) {
        if (elem && !elem.contains(e.target as Node)) stopInteracting()
    }

    // all keys go to the website while controlling it (e.g. arrow keys should not change FreeShow slides)
    function keydown(e: KeyboardEvent) {
        e.preventDefault()
        e.stopImmediatePropagation()
        getKeyEvents(e, "keydown").forEach(sendInput)
    }
    function keyup(e: KeyboardEvent) {
        e.preventDefault()
        e.stopImmediatePropagation()
        getKeyEvents(e, "keyup").forEach(sendInput)
    }

    function mouse(e: MouseEvent, type: "mouseDown" | "mouseUp") {
        if (!elem) return
        e.stopPropagation()
        const position = getRelativePosition(e, elem.getBoundingClientRect())
        sendInput({ type, ...position, button: getMouseButton(e.button), clickCount: e.detail || 1, modifiers: getModifiers(e) })
    }

    let moveFrame = 0
    function mousemove(e: MouseEvent) {
        if (!elem || moveFrame) return
        const position = getRelativePosition(e, elem.getBoundingClientRect())
        const modifiers = getModifiers(e)
        moveFrame = requestAnimationFrame(() => {
            moveFrame = 0
            sendInput({ type: "mouseMove", ...position, modifiers })
        })
    }

    function wheel(e: WheelEvent) {
        if (!elem) return
        e.preventDefault()
        e.stopPropagation()
        const position = getRelativePosition(e, elem.getBoundingClientRect())
        // Chromium wheel deltas are inverted compared to DOM deltas
        sendInput({ type: "mouseWheel", ...position, deltaX: -e.deltaX, deltaY: -e.deltaY, modifiers: getModifiers(e) })
    }
</script>

<div class="mirror" class:interacting bind:this={elem}>
    {#if frame}
        <img src={frame} alt="" draggable="false" />
    {:else}
        <div class="waiting">
            <Icon id="web" size={3} white />
        </div>
    {/if}

    {#if interacting}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="input" on:mousedown={(e) => mouse(e, "mouseDown")} on:mouseup={(e) => mouse(e, "mouseUp")} on:mousemove={mousemove} on:wheel={wheel} on:contextmenu|preventDefault|stopPropagation on:click|stopPropagation on:dblclick|stopPropagation />
    {/if}

    <div class="controls" style="zoom: {1 / ratio};">
        <Button on:click={toggleInteracting} active={interacting} title={translateText("edit.control_website")}>
            <Icon id="pointer" white />
        </Button>
    </div>
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

    .input {
        position: absolute;
        inset: 0;
        pointer-events: initial;
    }
    .mirror.interacting {
        outline: 4px solid var(--secondary);
        outline-offset: -4px;
    }

    .controls {
        z-index: 1;
        position: absolute;
        top: 0;
        right: 0;

        background-color: black;
        border-end-start-radius: 3px;
        opacity: 0.5;

        pointer-events: initial;
    }
    .mirror:hover .controls,
    .mirror.interacting .controls {
        opacity: 0.9;
    }
</style>
