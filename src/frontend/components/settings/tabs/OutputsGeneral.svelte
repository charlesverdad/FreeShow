<script lang="ts">
    import { autoOutput, dictionary, os, special } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import MaterialDropdown from "../../inputs/MaterialDropdown.svelte"
    import MaterialToggleSwitch from "../../inputs/MaterialToggleSwitch.svelte"
    import Tip from "../../main/Tip.svelte"

    function updateSpecial(value: any, key: string, allowEmpty = false) {
        special.update((a) => {
            if (!allowEmpty && !value) delete a[key]
            else a[key] = value

            return a
        })
    }

    $: textSizePreloadOptions = [
        { value: "off", label: translateText("settings.text_size_preload_off", $dictionary) },
        { value: "upcoming", label: translateText("settings.text_size_preload_upcoming", $dictionary) },
        { value: "project", label: translateText("settings.text_size_preload_project", $dictionary) }
    ]
</script>

<Tip type="info" value="tips.global_options" bottom={20} />

<MaterialToggleSwitch label="settings.auto_output" checked={$autoOutput} defaultValue={false} on:change={(e) => autoOutput.set(e.detail)} />
<!-- apparently doesn't work on some versions of macOS -->
{#if $os.platform !== "darwin" || $special.hideCursor}
    <MaterialToggleSwitch label="settings.hide_cursor_in_output" checked={$special.hideCursor} defaultValue={false} on:change={(e) => updateSpecial(e.detail, "hideCursor")} />
{/if}

<MaterialDropdown label="settings.text_size_preload" options={textSizePreloadOptions} value={$special.textSizePreload || "upcoming"} on:change={(e) => updateSpecial(e.detail === "upcoming" ? "" : e.detail, "textSizePreload")} />
