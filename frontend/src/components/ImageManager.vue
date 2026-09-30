<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps({
  images: { type: Array, required: true },
  onUpload: { type: Function, required: true },
  onSetCover: { type: Function, required: true },
  onRemove: { type: Function, required: true },
  max: { type: Number, default: 5 },
});

const uploading = ref(false);
const uploadProgress = ref('');
const error = ref('');
const dragOver = ref(false);
const fileInput = ref(null);

async function uploadFiles(files) {
  error.value = '';
  const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
  if (list.length === 0) return;

  uploading.value = true;
  try {
    for (let i = 0; i < list.length; i++) {
      if (props.images.length >= props.max) {
        error.value = t('admin.maxImagesReached', { max: props.max });
        break;
      }
      uploadProgress.value = list.length > 1 ? `${i + 1} / ${list.length}` : '';
      // eslint-disable-next-line no-await-in-loop
      await props.onUpload(list[i]);
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    uploading.value = false;
    uploadProgress.value = '';
  }
}

function onFileChange(event) {
  uploadFiles(event.target.files);
  event.target.value = '';
}

function onDrop(event) {
  dragOver.value = false;
  uploadFiles(event.dataTransfer.files);
}

async function remove(img) {
  if (!confirm(t('admin.confirmDeleteImage'))) return;
  error.value = '';
  try {
    await props.onRemove(img);
  } catch (err) {
    error.value = err.message;
  }
}

async function setCover(img) {
  error.value = '';
  try {
    await props.onSetCover(img);
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <div class="image-manager">
    <label
      class="dropzone"
      :class="{ over: dragOver, busy: uploading, full: images.length >= max }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        :disabled="uploading || images.length >= max"
        @change="onFileChange"
      />
      <svg v-if="!uploading" class="icon" viewBox="0 0 24 24">
        <path d="M19 13v6H5v-6H3v6a2 2 0 002 2h14a2 2 0 002-2v-6h-2zm-6-11L7.5 7.5l1.41 1.41L12 5.83l3.09 3.08L16.5 7.5 12 2z" />
        <path d="M11 4v11h2V4z" />
      </svg>
      <svg v-else class="icon spin" viewBox="0 0 24 24">
        <path d="M12 4V1L8 5l4 4V6a6 6 0 11-6 6H4a8 8 0 108-8z" />
      </svg>
      <span v-if="uploading" class="label">{{ $t('admin.uploadingLabel') }}{{ uploadProgress ? ` (${uploadProgress})` : '' }}...</span>
      <span v-else-if="images.length >= max" class="label">{{ $t('admin.maxImagesReached', { max }) }}</span>
      <span v-else class="label">{{ $t('admin.dropImagesHint') }}</span>
      <span v-if="!uploading" class="hint">{{ $t('admin.imageFormatHint') }} · {{ images.length }}/{{ max }}</span>
    </label>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="images.length === 0" class="empty-state">{{ $t('admin.noImagesYet') }}</div>
    <div v-else class="grid">
      <div v-for="img in images" :key="img.id" class="tile" :class="{ cover: img.isCover }">
        <img :src="img.urlThumbnail" :alt="''" />
        <span v-if="img.isCover" class="cover-badge">{{ $t('admin.coverBadge') }}</span>
        <div class="overlay">
          <button v-if="!img.isCover" type="button" class="pill" @click="setCover(img)">{{ $t('admin.setAsCover') }}</button>
          <button type="button" class="pill danger" @click="remove(img)">{{ $t('admin.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-manager { display: flex; flex-direction: column; gap: 1rem; }

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 1.75rem 1rem;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.dropzone:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.dropzone.over { border-color: var(--color-primary); background: var(--color-primary-light); }
.dropzone.busy { cursor: default; }
.dropzone.full { opacity: 0.6; cursor: not-allowed; }
.dropzone input { display: none; }
.dropzone .icon { width: 28px; height: 28px; fill: var(--color-primary); }
.dropzone .icon.spin { animation: spin 0.9s linear infinite; }
.dropzone .label { font-size: 0.9rem; font-weight: 600; color: var(--color-text); }
.dropzone .hint { font-size: 0.78rem; color: var(--color-text-muted); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.85rem; }
.tile {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #f1f5f9;
  border: 2px solid transparent;
  box-shadow: var(--shadow-sm);
}
.tile.cover { border-color: var(--color-primary); }
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.5rem;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.65), transparent 55%);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tile:hover .overlay, .tile:focus-within .overlay { opacity: 1; }
.pill {
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: none;
  font-size: 0.7rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
}
.pill.danger { background: var(--color-danger); color: #fff; }
</style>
