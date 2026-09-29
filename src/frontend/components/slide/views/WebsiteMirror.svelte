<script lang="ts">
    import { onDestroy } from "svelte"
    import { OUTPUT } from "../../../../types/Channels"
    import { websiteFrames, websiteMirrors } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import { send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"
    import Button from "../../inputs/Button.svelte"
    import type { WebsiteInputEvent } from "./websiteInput"
    import { getKeyEvents, getModifiers, getMouseButton, getRelativePosition } from "./websiteInput"

    // shows the live website of the output window (single browser instance),
    // and can forward mouse/keyboard input to it
    export let key: string
    export let ratio = 1

    $: frame = $websiteFrames[key]
    $: attached = !!$websiteMirrors[key]

    // subscribe to frames (and move the subscription if the key changes)
    let subscribedKey = ""
    $: if (key !== subscribedKey) subscribe(key)
    function subscribe(newKey: string) {
        if (subscribedKey) send(OUTPUT, ["WEBSITE_MIRROR"], { id: subscribedKey, enabled: false })
        stopInteracting()
        subscribedKey = newKey
        if (newKey) send(OUTPUT, ["WEBSITE_MIRROR"], { id: newKey, enabled: true })
    }
    onDestroy(() => subscribe(""))

    function sendInput(event: WebsiteInputEvent) {
        send(OUTPUT, ["WEBSITE_INPUT"], { id: subscribedKey, event })
    }

    // INTERACTION

    let elem: HTMLDivElement | undefined
    let interacting = false

    function toggleInteracting() {
        if (interacting) stopInteracting()
        else startInteracting()
    }

    function startInteracting() {
        if (!attached) return
        interacting = true
        window.addEventListener("keydown", keydown, true)
        window.addEventListener("keyup", keyup, true)
        window.addEventListener("mousedown", mousedownOutside, true)
        window.addEventListener("blur", stopInteracting)
    }

    function stopInteracting() {
        if (!interacting) return
        interacting = false
        window.removeEventListener("keydown", keydown, true)
        window.removeEventListener("keyup", keyup, true)
        window.removeEventListener("mousedown", mousedownOutside, true)
        window.removeEventListener("blur", stopInteracting)
        if (moveFrame) cancelAnimationFrame(moveFrame)
        moveFrame = 0

        // release anything still held, so the website does not get stuck
        pressedKeys.forEach((keyCode) => sendInput({ type: "keyUp", keyCode }))
        pressedKeys.clear()
        pressedButtons.forEach((button) => sendInput({ type: "mouseUp", x: lastPosition.x, y: lastPosition.y, button, clickCount: 1 }))
        pressedButtons.clear()
    }

    $: if (!attached) stopInteracting()

    function mousedownOutside(e: MouseEvent) {
        if (elem && !elem.contains(e.target as Node)) stopInteracting()
    }

    // all keys go to the website while controlling it (e.g. arrow keys should not change FreeShow slides)
    const pressedKeys = new Set<string>()
    function keydown(e: KeyboardEvent) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const events = getKeyEvents(e, "keydown")
        if (events[0] && "keyCode" in events[0]) pressedKeys.add(events[0].keyCode)
        events.forEach(sendInput)
    }
    function keyup(e: KeyboardEvent) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const events = getKeyEvents(e, "keyup")
        if (events[0] && "keyCode" in events[0]) pressedKeys.delete(events[0].keyCode)
        events.forEach(sendInput)
    }

    // pointer capture keeps sending moves/release even if the mouse leaves the preview while pressed
    const pressedButtons = new Set<"left" | "middle" | "right">()
    let lastPosition = { x: 0, y: 0 }
    function pointer(e: PointerEvent, type: "mouseDown" | "mouseUp") {
        if (!elem) return
        e.stopPropagation()
        const target = e.currentTarget as HTMLElement
        const button = getMouseButton(e.button)
        if (type === "mouseDown") {
            target.setPointerCapture(e.pointerId)
            pressedButtons.add(button)
        } else {
            if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
            pressedButtons.delete(button)
        }

        lastPosition = getRelativePosition(e, elem.getBoundingClientRect())
        sendInput({ type, ...lastPosition, button, clickCount: e.detail || 1, modifiers: getModifiers(e) })
    }

    let moveFrame = 0
    function pointermove(e: PointerEvent) {
        if (!elem || moveFrame) return
        lastPosition = getRelativePosition(e, elem.getBoundingClientRect())
        const modifiers = getModifiers(e)
        // include held button for dragging
        const button = e.buttons & 1 ? "left" : e.buttons & 2 ? "right" : e.buttons & 4 ? "middle" : undefined
        moveFrame = requestAnimationFrame(() => {
            moveFrame = 0
            if (interacting) sendInput({ type: "mouseMove", ...lastPosition, button, modifiers })
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
        <div class="input" on:pointerdown={(e) => pointer(e, "mouseDown")} on:pointerup={(e) => pointer(e, "mouseUp")} on:pointermove={pointermove} on:wheel={wheel} on:contextmenu|preventDefault|stopPropagation on:click|stopPropagation on:dblclick|stopPropagation />
    {/if}

    {#if attached}
        <div class="controls" style="zoom: {1 / ratio};">
            {#if interacting}
                <Button on:click={stopInteracting} title={translateText("edit.control_website")}>
                    <Icon id="close" white />
                    <span>{translateText("media.stop")}</span>
                </Button>
            {:else}
                <Button on:click={toggleInteracting} title={translateText("edit.control_website")}>
                    <Icon id="pointer" white />
                </Button>
            {/if}
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

    .input {
        position: absolute;
        inset: 0;
        pointer-events: initial;
        touch-action: none;
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
    .controls span {
        margin-inline-start: 4px;
    }
    .mirror.interacting .controls {
        background-color: var(--secondary);
        opacity: 1;
    }
</style>
