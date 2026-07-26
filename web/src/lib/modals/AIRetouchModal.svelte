<script lang="ts">
  import { runAIRetouch } from '$lib/services/asset.service';
  import { Field, FormModal, HelperText, Switch } from '@immich/ui';
  import { mdiAutoFix } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { AssetResponseDto } from '@immich/sdk';

  interface Props {
    onClose: () => void;
    asset: AssetResponseDto;
  }

  let { onClose, asset }: Props = $props();

  let multiFace = $state(true);
  let beautyLevel = $state(0.5);

  const beautyLabel = $derived(beautyLevel.toFixed(1));

  const onSubmit = () => {
    runAIRetouch(asset, {
      multiFace,
      beautyLevel: Math.round(beautyLevel * 10) / 10,
    });
    onClose();
  };
</script>

<FormModal
  size="small"
  title={$t('ai_retouch')}
  icon={mdiAutoFix}
  submitText={$t('ai_retouch_start')}
  {onClose}
  {onSubmit}
>
  <div class="flex flex-col gap-6 py-2">
    <Field label={$t('ai_retouch_multi_face')} description={$t('ai_retouch_multi_face_description')}>
      <Switch bind:checked={multiFace} />
    </Field>

    <Field label={$t('ai_retouch_beauty_level')} description={$t('ai_retouch_beauty_level_description')}>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={beautyLevel}
          oninput={(e) => (beautyLevel = parseFloat(e.currentTarget.value))}
          class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-300 accent-immich-primary dark:bg-gray-700"
          aria-label={$t('ai_retouch_beauty_level')}
        />
        <span class="w-8 shrink-0 text-center text-sm font-medium tabular-nums">{beautyLabel}</span>
      </div>
      <HelperText>{$t('ai_retouch_beauty_level_helper', { values: { value: beautyLabel } })}</HelperText>
    </Field>
  </div>
</FormModal>
