<script lang="ts">
    import PooledWebsite from "./PooledWebsite.svelte"
    import { websiteSlots } from "./websitePool"

    // output window: websites stay loaded here between slides (see websitePool.ts)
    export let ratio = 1

    let container: HTMLElement | undefined
</script>

<div class="pool" bind:this={container}>
    {#each Object.values($websiteSlots) as slot (slot.src)}
        <PooledWebsite website={slot} {container} {ratio} />
    {/each}
</div>

<style>
    .pool {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
    }
</style>
