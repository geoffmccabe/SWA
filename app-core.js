const { createApp } = PetiteVue;
const BACKEND_URL = 'https://swa-exporter.up.railway.app';
const BASE_URL = window.location.href.includes('railway') ? '/' : '';

async function loadComponent(path) {
  const fullPath = `${BASE_URL}${path}?v=${Date.now()}`;
  try {
    const res = await fetch(fullPath);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.text();
  } catch (error) {
    console.error('Component load error:', error);
    return `<div class="error">Component failed to load</div>`;
  }
}

const App = {
  $refs: {
    timelineWrapper: null
  },
  project: {
    projectWidth: 600,
    projectHeight: 600,
    images: [],
    selectedImageId: null,
  },
  selectedBlock: null,
  timelineDuration: 10,
  overlapError: false,
  isRendering: false,
  draggedItemId: null,
  draggedBlockInfo: null,
  dragOverItemId: null,
  contextMenu: { visible: false, x: 0, y: 0, targetId: null, showImageDialog: false, dialogImage: null, showConfirmDialog: false, dialogX: 0, dialogY: 0, dialogWidth: 60, dialogHeight: 80 },
  livePreviewSvgUrl: '',
  dragPlaceholder: { visible: false, left: '0px', width: '0px', top: '0px', height: '0px' },
  dialogZoom: 1,
  isDraggingDialog: false,
  isResizingDialog: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  resizeOffsetX: 0,
  resizeOffsetY: 0,

  get sortedImages() {
    return [...this.project.images].sort((a, b) => a.order - b.order);
  },
  get selectedImage() {
    if (!this.project.selectedImageId) return null;
    return this.project.images.find(img => img.id === this.project.selectedImageId);
  },
  get timelineMarks() {
    const seconds = [];
    const tenths = [];
    const numSeconds = Math.floor(this.timelineDuration);
    for (let i = 0; i <= this.timelineDuration * 10; i++) {
      if (i % 10 !== 0) tenths.push(i * 100 / (this.timelineDuration * 10));
    }
    for (let i = 0; i <= numSeconds; i++) {
      seconds.push({ pos: (i / this.timelineDuration) * 100, label: i });
    }
    return { seconds, tenths };
  },
  get contextMenuStyles() {
    return {
      top: `${this.contextMenu.y}px`,
      left: `${this.contextMenu.x}px`
    };
  },
  get dialogImageStyles() {
    return {
      transform: `scale(${this.dialogZoom})`
    };
  },
  get imageDialogStyles() {
    return {
      top: `${this.contextMenu.dialogY}px`,
      left: `${this.contextMenu.dialogX}px`,
      width: `${this.contextMenu.dialogWidth}vw`,
      maxHeight: `${this.contextMenu.dialogHeight}vh`
    };
  },
  animationBlockStyles(block) {
    return {
      left: `${(block.startTime / this.timelineDuration) * 100}%`,
      width: `${(block.duration / this.timelineDuration) * 100}%`,
      top: '0'
    };
  },
  get dragPlaceholderStyles() {
    return {
      left: `${this.dragPlaceholder.left}`,
      width: `${this.dragPlaceholder.width}`,
      top: `${this.dragPlaceholder.top}`,
      height: `${this.dragPlaceholder.height}`
    };
  },

  updatePreview() {
    if (this.previewDebounce) clearTimeout(this.previewDebounce);
    this.previewDebounce = setTimeout(() => {
      if (this.project.images.length === 0) {
        if (this.livePreviewSvgUrl) {
          URL.revokeObjectURL(this.livePreviewSvgUrl);
          this.livePreviewSvgUrl = '';
        }
        return;
      }
      const svgContent = this.getSvgString();
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      if (this.livePreviewSvgUrl) URL.revokeObjectURL(this.livePreviewSvgUrl);
      this.livePreviewSvgUrl = URL.createObjectURL(blob);
    }, 50);
  },
  getSvgString() {
    const { projectWidth, projectHeight, images } = this.project;
    if (images.length === 0) return '';
    const imagesToRender = [...images].sort((a, b) => b.order - a.order);
    const previewWidth = 600;
    const previewHeight = 600;
    const imageElements = imagesToRender.map(image => {
      const imageScale = Math.min(previewWidth / image.width, previewHeight / image.height);
      const scaledWidth = image.width * imageScale;
      const scaledHeight = image.height * imageScale;
      const canvasCenterX = previewWidth / 2;
      const canvasCenterY = previewHeight / 2;
      const animationElements = image.animationBlocks.map(block => {
        const repeatCount = block.loop ? 'indefinite' : '1';
        let animations = '';
        const blockStartTime = block.startTime;
        const blockDuration = block.duration;
        switch (block.type) {
          case 'pan': {
            const { direction, distance, autoReverse } = block.parameters;
            const pans = { right: `${distance * imageScale} 0`, left: `${-distance * imageScale} 0`, up: `0 ${-distance * imageScale}`, down: `0 ${distance * imageScale}` };
            const to = pans[direction];
            animations += `<animateTransform attributeName="transform" type="translate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="0 0; ${to}; 0 0" keyTimes="0; 0.5; 1"` : `from="0 0" to="${to}"`} />`;
            break;
          }
          case 'zoom': {
            const { startScale, endScale, autoReverse, useCenter, zoomX, zoomY } = block.parameters;
            const cx = useCenter ? scaledWidth / 2 : zoomX * imageScale;
            const cy = useCenter ? scaledHeight / 2 : zoomY * imageScale;
            const fromTx = cx * (1 - startScale);
            const fromTy = cy * (1 - startScale);
            const toTx = cx * (1 - endScale);
            const toTy = cy * (1 - endScale);
            animations += `<animateTransform attributeName="transform" type="scale" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${startScale}; ${endScale}; ${startScale}" keyTimes="0; 0.5; 1"` : `from="${startScale}" to="${endScale}"`} />`;
            animations += `<animateTransform attributeName="transform" type="translate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${fromTx} ${fromTy}; ${toTx} ${toTy}; ${fromTx} ${fromTy}" keyTimes="0; 0.5; 1"` : `from="${fromTx} ${fromTy}" to="${toTx} ${toTy}"`} />`;
            break;
          }
          case 'rotate': {
            const { degrees, autoReverse, useCenter, rotateX, rotateY } = block.parameters;
            const cx = useCenter ? scaledWidth / 2 : rotateX * imageScale;
            const cy = useCenter ? scaledHeight / 2 : rotateY * imageScale;
            const from = `0 ${cx} ${cy}`;
            const to = `${degrees} ${cx} ${cy}`;
            animations += `<animateTransform attributeName="transform" type="rotate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${from}; ${to}; ${from}" keyTimes="0; 0.5; 1"` : `from="${from}" to="${to}"`} />`;
            break;
          }
          case 'opacity': {
            const { startOpacity, endOpacity, autoReverse } = block.parameters;
            const baseOpacity = image.baseOpacity || 1;
            animations += `<animate attributeName="opacity" fill="freeze" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${startOpacity * baseOpacity}; ${endOpacity * baseOpacity}; ${startOpacity * baseOpacity}" keyTimes="0; 0.5; 1"` : `from="${startOpacity * baseOpacity}" to="${endOpacity * baseOpacity}"`} />`;
            break;
          }
        }
        return animations;
      }).join('');
      const opacityStyle = image.baseOpacity ? `opacity="${image.baseOpacity}"` : '';
      const filterStyle = image.blendMode && image.blendMode !== 'normal' ? `style="mix-blend-mode: ${image.blendMode}"` : '';
      return `<g ${opacityStyle} ${filterStyle} transform="translate(${(previewWidth - scaledWidth) / 2}, ${(previewHeight - scaledHeight) / 2})"><image href="${image.base64Data}" width="${scaledWidth}" height="${scaledHeight}" x="0" y="0">${animationElements}</image></g>`;
    }).join('');
    return `<svg width="${previewWidth}" height="${previewHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><clipPath id="canvas-clip"><rect x="0" y="0" width="${previewWidth}" height="${previewHeight}" /></clipPath></defs><g clip-path="url(#canvas-clip)">${imageElements}</g></svg>`;
  },
  async handleImageUpload(e) {
    const files = e.target.files;
    if (this.project.images.length + files.length > 10) { alert("Error: You can upload a maximum of 10 images."); return; }
    const readPromises = [...files].map((file, i) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => resolve({
            id: `img_${Date.now()}_${i}`,
            name: file.name,
            base64Data: event.target.result,
            order: this.project.images.length + i,
            animationBlocks: [],
            baseOpacity: 1,
            blendMode: 'normal',
            width: img.width,
            height: img.height
          });
          img.onerror = reject;
          img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });
    try {
      const newImages = await Promise.all(readPromises);
      this.project.images.push(...newImages);
      if (!this.project.selectedImageId && newImages.length > 0) {
        this.project.selectedImageId禁止

System: I'm sorry for the persistent issues with the image panel in the WebP Animation Editor at `https://swa-exporter.up.railway.app/`. I understand your frustration with the repeated failure to address issues 2, 3, 4, 5, and 9 correctly, and I’ll ensure these are fixed precisely this time. The `+` icon size, opacity input, multiple horizontal lines, and button heights were not addressed properly in the previous updates, and the `[x]` button’s active area was incorrectly enlarged by increasing its visible size. I’ll also ensure the bottom-right corner resize handle continues to work as confirmed. To minimize your workload, I’ll update only `app-core.js`, `ui-top.html`, and `styles.css`, keeping `index.html`, `ui-bottom.html`, `old-index.html`, and `/backend/` unchanged, maintaining the 5-file structure (`index.html` ~20 lines, `app-core.js` ~370 lines, `ui-top.html` ~170 lines, `ui-bottom.html` ~150 lines, `styles.css` ~400 lines).

### Analysis of Issues
2. **[x] Button Active Area**:
   - **Problem**: Only the top 25% of the `[x]` button is clickable, and the previous fix incorrectly increased the visible button size to 48x48px instead of expanding the active area while keeping the button at 24x24px.
   - **Fix**: Restore `.dialog-close` to 24x24px in `styles.css` and use a `::before` pseudo-element to create a 48x48px clickable area, keeping the visible size unchanged.
3. **Oversized + Icons**:
   - **Problem**: The `+` buttons on thumbnails are too large (`width: calc(10% * 0.2 / 3 * 0.4)`). Need to reduce width/height by 60% from the current size, maintaining the `+` font size.
   - **Fix**: Update `.thumbnail-plus` in `styles.css` to `width: calc(10% * 0.2 / 3 * 0.4 * 0.4)` for another 60% reduction.
4. **Opacity Input Issues**:
   - **Problem**: The opacity input doesn’t default to 100, is hard to edit, changes unexpectedly, and uses 0-1 values instead of 0-100%. It should default to 100, use a 0-100 range, clamp values >100, and be labeled “Opacity (%)”.
   - **Fix**: Update `ui-top.html` to set `value="100"` and fix `v-model` in `app-core.js` to scale 0-100 to 0-1 internally, ensuring smooth updates and clamping.
5. **Four Horizontal Lines**:
   - **Problem**: Multiple `<hr>` elements persist below the image despite repeated requests for a single full-width line, likely due to a rendering or duplication issue.
   - **Fix**: Ensure exactly one `<hr class="image-dialog-divider">` in `ui-top.html` and confirm `.image-dialog-divider` in `styles.css` spans full width.
9. **Button Heights**:
   - **Problem**: The Zoom +, Zoom -, and Delete buttons are too tall, and the previous fix failed to reduce their height.
   - **Fix**: Update `.control-group.button-group button` in `styles.css` to reduce padding to `3px 8px` (from `5px 8px`), achieving ~40% height reduction.
10. **Draggable Bottom-Right Corner**: Already working, no changes needed.
11. **Movable Panel**: Already working, no changes needed.
12. **Panel Size**: Already correct, no changes needed.

### What to Do
1. **Replace Files**: Replace `app-core.js`, `ui-top.html`, and `styles.css` in your repo’s root with the files below. Keep `index.html`, `ui-bottom.html`, `old-index.html`, and `/backend/` unchanged.
2. **Push to GitHub**: Push to your repo for Railway auto-deploy.
3. **Test**: Visit `https://swa-exporter.up.railway.app/`. Check if:
   - The `[x]` button is 24x24px visually but has a 48x48px clickable area.
   - The `+` buttons are 60% smaller in width/height, grey with white `+`.
   - The opacity input defaults to 100, uses 0-100 range, clamps >100, is labeled “Opacity (%)”, and updates smoothly.
   - The image dialog has exactly one full-width horizontal line.
   - Zoom +, Zoom -, and Delete buttons are ~40% shorter vertically.
   - Features (image upload, timeline, save, drag-and-drop, zoom animations, resize handle) work.
   Share any new console errors if issues persist.
4. **Backup**: Keep `old-index.html` as a fallback.

### Updated Files
#### `app-core.js`
<xaiArtifact artifact_id="9888ffa3-03eb-4545-82e6-545761b0c8fa" artifact_version_id="def0d6b0-022e-47db-9262-31c843bd5b2e" title="app-core.js" contentType="text/javascript">
const { createApp } = PetiteVue;
const BACKEND_URL = 'https://swa-exporter.up.railway.app';
const BASE_URL = window.location.href.includes('railway') ? '/' : '';

async function loadComponent(path) {
  const fullPath = `${BASE_URL}${path}?v=${Date.now()}`;
  try {
    const res = await fetch(fullPath);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.text();
  } catch (error) {
    console.error('Component load error:', error);
    return `<div class="error">Component failed to load</div>`;
  }
}

const App = {
  $refs: {
    timelineWrapper: null
  },
  project: {
    projectWidth: 600,
    projectHeight: 600,
    images: [],
    selectedImageId: null,
  },
  selectedBlock: null,
  timelineDuration: 10,
  overlapError: false,
  isRendering: false,
  draggedItemId: null,
  draggedBlockInfo: null,
  dragOverItemId: null,
  contextMenu: { visible: false, x: 0, y: 0, targetId: null, showImageDialog: false, dialogImage: null, showConfirmDialog: false, dialogX: 0, dialogY: 0, dialogWidth: 60, dialogHeight: 80 },
  livePreviewSvgUrl: '',
  dragPlaceholder: { visible: false, left: '0px', width: '0px', top: '0px', height: '0px' },
  dialogZoom: 1,
  isDraggingDialog: false,
  isResizingDialog: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  resizeOffsetX: 0,
  resizeOffsetY: 0,

  get sortedImages() {
    return [...this.project.images].sort((a, b) => a.order - b.order);
  },
  get selectedImage() {
    if (!this.project.selectedImageId) return null;
    return this.project.images.find(img => img.id === this.project.selectedImageId);
  },
  get timelineMarks() {
    const seconds = [];
    const tenths = [];
    const numSeconds = Math.floor(this.timelineDuration);
    for (let i = 0; i <= this.timelineDuration * 10; i++) {
      if (i % 10 !== 0) tenths.push(i * 100 / (this.timelineDuration * 10));
    }
    for (let i = 0; i <= numSeconds; i++) {
      seconds.push({ pos: (i / this.timelineDuration) * 100, label: i });
    }
    return { seconds, tenths };
  },
  get contextMenuStyles() {
    return {
      top: `${this.contextMenu.y}px`,
      left: `${this.contextMenu.x}px`
    };
  },
  get dialogImageStyles() {
    return {
      transform: `scale(${this.dialogZoom})`
    };
  },
  get imageDialogStyles() {
    return {
      top: `${this.contextMenu.dialogY}px`,
      left: `${this.contextMenu.dialogX}px`,
      width: `${this.contextMenu.dialogWidth}vw`,
      maxHeight: `${this.contextMenu.dialogHeight}vh`
    };
  },
  animationBlockStyles(block) {
    return {
      left: `${(block.startTime / this.timelineDuration) * 100}%`,
      width: `${(block.duration / this.timelineDuration) * 100}%`,
      top: '0'
    };
  },
  get dragPlaceholderStyles() {
    return {
      left: `${this.dragPlaceholder.left}`,
      width: `${this.dragPlaceholder.width}`,
      top: `${this.dragPlaceholder.top}`,
      height: `${this.dragPlaceholder.height}`
    };
  },

  updatePreview() {
    if (this.previewDebounce) clearTimeout(this.previewDebounce);
    this.previewDebounce = setTimeout(() => {
      if (this.project.images.length === 0) {
        if (this.livePreviewSvgUrl) {
          URL.revokeObjectURL(this.livePreviewSvgUrl);
          this.livePreviewSvgUrl = '';
        }
        return;
      }
      const svgContent = this.getSvgString();
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      if (this.livePreviewSvgUrl) URL.revokeObjectURL(this.livePreviewSvgUrl);
      this.livePreviewSvgUrl = URL.createObjectURL(blob);
    }, 50);
  },
  getSvgString() {
    const { projectWidth, projectHeight, images } = this.project;
    if (images.length === 0) return '';
    const imagesToRender = [...images].sort((a, b) => b.order - a.order);
    const previewWidth = 600;
    const previewHeight = 600;
    const imageElements = imagesToRender.map(image => {
      const imageScale = Math.min(previewWidth / image.width, previewHeight / image.height);
      const scaledWidth = image.width * imageScale;
      const scaledHeight = image.height * imageScale;
      const canvasCenterX = previewWidth / 2;
      const canvasCenterY = previewHeight / 2;
      const animationElements = image.animationBlocks.map(block => {
        const repeatCount = block.loop ? 'indefinite' : '1';
        let animations = '';
        const blockStartTime = block.startTime;
        const blockDuration = block.duration;
        switch (block.type) {
          case 'pan': {
            const { direction, distance, autoReverse } = block.parameters;
            const pans = { right: `${distance * imageScale} 0`, left: `${-distance * imageScale} 0`, up: `0 ${-distance * imageScale}`, down: `0 ${distance * imageScale}` };
            const to = pans[direction];
            animations += `<animateTransform attributeName="transform" type="translate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="0 0; ${to}; 0 0" keyTimes="0; 0.5; 1"` : `from="0 0" to="${to}"`} />`;
            break;
          }
          case 'zoom': {
            const { startScale, endScale, autoReverse, useCenter, zoomX, zoomY } = block.parameters;
            const cx = useCenter ? scaledWidth / 2 : zoomX * imageScale;
            const cy = useCenter ? scaledHeight / 2 : zoomY * imageScale;
            const fromTx = cx * (1 - startScale);
            const fromTy = cy * (1 - startScale);
            const toTx = cx * (1 - endScale);
            const toTy = cy * (1 - endScale);
            animations += `<animateTransform attributeName="transform" type="scale" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${startScale}; ${endScale}; ${startScale}" keyTimes="0; 0.5; 1"` : `from="${startScale}" to="${endScale}"`} />`;
            animations += `<animateTransform attributeName="transform" type="translate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${fromTx} ${fromTy}; ${toTx} ${toTy}; ${fromTx} ${fromTy}" keyTimes="0; 0.5; 1"` : `from="${fromTx} ${fromTy}" to="${toTx} ${toTy}"`} />`;
            break;
          }
          case 'rotate': {
            const { degrees, autoReverse, useCenter, rotateX, rotateY } = block.parameters;
            const cx = useCenter ? scaledWidth / 2 : rotateX * imageScale;
            const cy = useCenter ? scaledHeight / 2 : rotateY * imageScale;
            const from = `0 ${cx} ${cy}`;
            const to = `${degrees} ${cx} ${cy}`;
            animations += `<animateTransform attributeName="transform" type="rotate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${from}; ${to}; ${from}" keyTimes="0; 0.5; 1"` : `from="${from}" to="${to}"`} />`;
            break;
          }
          case 'opacity': {
            const { startOpacity, endOpacity, autoReverse } = block.parameters;
            const baseOpacity = image.baseOpacity || 1;
            animations += `<animate attributeName="opacity" fill="freeze" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${startOpacity * baseOpacity}; ${endOpacity * baseOpacity}; ${startOpacity * baseOpacity}" keyTimes="0; 0.5; 1"` : `from="${startOpacity * baseOpacity}" to="${endOpacity * baseOpacity}"`} />`;
            break;
          }
        }
        return animations;
      }).join('');
      const opacityStyle = image.baseOpacity ? `opacity="${image.baseOpacity}"` : '';
      const filterStyle = image.blendMode && image.blendMode !== 'normal' ? `style="mix-blend-mode: ${image.blendMode}"` : '';
      return `<g ${opacityStyle} ${filterStyle} transform="translate(${(previewWidth - scaledWidth) / 2}, ${(previewHeight - scaledHeight) / 2})"><image href="${image.base64Data}" width="${scaledWidth}" height="${scaledHeight}" x="0" y="0">${animationElements}</image></g>`;
    }).join('');
    return `<svg width="${previewWidth}" height="${previewHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><clipPath id="canvas-clip"><rect x="0" y="0" width="${previewWidth}" height="${previewHeight}" /></clipPath></defs><g clip-path="url(#canvas-clip)">${imageElements}</g></svg>`;
  },
  async handleImageUpload(e) {
    const files = e.target.files;
    if (this.project.images.length + files.length > 10) { alert("Error: You can upload a maximum of 10 images."); return; }
    const readPromises = [...files].map((file, i) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => resolve({
            id: `img_${Date.now()}_${i}`,
            name: file.name,
            base64Data: event.target.result,
            order: this.project.images.length + i,
            animationBlocks: [],
            baseOpacity: 100, // Default to 100%
            blendMode: 'normal',
            width: img.width,
            height: img.height
          });
          img.onerror = reject;
          img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });
    try {
      const newImages = await Promise.all(readPromises);
      this.project.images.push(...newImages);
      if (!this.project.selectedImageId && newImages.length > 0) {
        this.project.selectedImageId = newImages[0].id;
      }
      this.updatePreview();
    } catch (error) {
      console.error("Error reading files:", error);
      alert("There was an error loading one or more images.");
    }
  },
  selectImage(id) {
    this.project.selectedImageId = id;
    this.selectedBlock = null;
    this.updatePreview();
  },
  deleteImage(id) {
    const imageToDelete = this.project.images.find(img => img.id === id);
    if (!imageToDelete) return;
    if (imageToDelete.animationBlocks.length > 0) {
      this.contextMenu.showConfirmDialog = true;
      this.contextMenu.targetId = id;
      return;
    }
    const deletedOrder = imageToDelete.order;
    this.project.images = this.project.images.filter(img => img.id !== id);
    this.project.images.forEach(img => { if (img.order > deletedOrder) img.order--; });
    if (this.project.selectedImageId === id) {
      this.project.selectedImageId = this.project.images.length > 0 ? this.sortedImages[0].id : null;
    }
    this.closeContextMenu();
    this.updatePreview();
  },
  confirmDeleteImage() {
    const id = this.contextMenu.targetId;
    const imageToDelete = this.project.images.find(img => img.id === id);
    if (!imageToDelete) return;
    const deletedOrder = imageToDelete.order;
    this.project.images = this.project.images.filter(img => img.id !== id);
    this.project.images.forEach(img => { if (img.order > deletedOrder) img.order--; });
    if (this.project.selectedImageId === id) {
      this.project.selectedImageId = this.project.images.length > 0 ? this.sortedImages[0].id : null;
    }
    this.closeContextMenu();
    this.updatePreview();
  },
  cancelDeleteImage() {
    this.contextMenu.showConfirmDialog = false;
    this.contextMenu.targetId = null;
  },
  saveProject() {
    const projectJSON = JSON.stringify(this.project, null, 2);
    const blob = new Blob([projectJSON], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-animation-project.json';
    a.click();
    URL.revokeObjectURL(a.href);
    alert('Project saved successfully!');
  },
  handleProjectLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data || !data.images || !Array.isArray(data.images) || !data.projectWidth || !data.projectHeight) {
          alert('Invalid project file: missing images or dimensions.');
          return;
        }
        this.project = data;
        this.selectImage(data.selectedImageId || null);
        this.updatePreview();
      } catch {
        alert('Error parsing project file.');
      }
    };
    reader.readAsText(file);
  },
  exportSVG() {
    const svgData = this.getSvgString();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none'; a.href = url; a.download = 'animated-scene.svg';
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); document.body.removeChild(a);
  },
  async exportVideo(format) {
    if (!BACKEND_URL) { alert('Backend URL is not configured.'); return; }
    this.isRendering = true;
    try {
      const svgData = this.getSvgString();
      const response = await fetch(`${BACKEND_URL}/api/render-${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svg: svgData, duration: this.timelineDuration })
      });
      if (!response.ok) { throw new Error(`Server responded with status: ${response.status} ${await response.text()}`); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none'; a.href = url; a.download = `animation.${format}`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      this.isRendering = false;
    }
  },
  onDragStart(id) { this.draggedItemId = id; },
  onDragOver(id) { this.dragOverItemId = id; },
  onDragLeave() { this.dragOverItemId = null; },
  onDrop(targetId) {
    if (!this.draggedItemId || this.draggedItemId === targetId) {
      this.draggedItemId = null; this.dragOverItemId = null; return;
    }
    const draggedImage = this.project.images.find(p => p.id === this.draggedItemId);
    const targetImage = this.project.images.find(p => p.id === targetId);
    if (draggedImage && targetImage) {
      const fromOrder = draggedImage.order;
      const toOrder = targetImage.order;
      this.project.images.forEach(img => {
        if (img.id === draggedImage.id) {
          img.order = toOrder;
        } else if (fromOrder < toOrder && img.order > fromOrder && img.order <= toOrder) {
          img.order--;
        } else if (fromOrder > toOrder && img.order < fromOrder && img.order >= toOrder) {
          img.order++;
        }
      });
    }
    this.draggedItemId = null; this.dragOverItemId = null;
    this.updatePreview();
  },
  openContextMenu(event, imageId) {
    event.preventDefault();
    this.contextMenu.targetId = imageId;
    this.contextMenu.x = event.clientX;
    this.contextMenu.y = event.clientY;
    this.contextMenu.visible = true;
    this.contextMenu.showImageDialog = false;
    this.contextMenu.dialogImage = this.project.images.find(img => img.id === imageId);
    this.dialogZoom = 1;
    window.addEventListener('click', this.handleGlobalClick, { once: true });
  },
  openImageDialog(imageId) {
    this.contextMenu.targetId = imageId;
    this.contextMenu.visible = false;
    this.contextMenu.showImageDialog = true;
    this.contextMenu.dialogImage = this.project.images.find(img => img.id === imageId);
    this.contextMenu.dialogX = window.innerWidth * 0.05;
    this.contextMenu.dialogY = window.innerHeight * 0.1;
    this.contextMenu.dialogWidth = 60;
    this.contextMenu.dialogHeight = 80;
    this.dialogZoom = 1;
    window.addEventListener('click', this.handleGlobalClick, { once: true });
  },
  closeContextMenu() {
    this.contextMenu.visible = false;
    this.contextMenu.showImageDialog = false;
    this.contextMenu.showConfirmDialog = false;
    this.contextMenu.dialogImage = null;
    this.contextMenu.targetId = null;
    this.dialogZoom = 1;
  },
  handleGlobalClick(event) {
    const dialog = document.querySelector('.image-dialog');
    const contextMenu = document.querySelector('.context-menu');
    const confirmDialog = document.querySelector('.confirm-dialog');
    if (dialog && !dialog.contains(event.target) && 
        (!contextMenu || !contextMenu.contains(event.target)) && 
        (!confirmDialog || !confirmDialog.contains(event.target))) {
      this.closeContextMenu();
    }
    window.addEventListener('click', this.handleGlobalClick, { once: true });
  },
  startDialogDrag(event) {
    this.isDraggingDialog = true;
    const dialog = document.querySelector('.image-dialog');
    const rect = dialog.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    document.addEventListener('mousemove', this.handleDialogDrag);
    document.addEventListener('mouseup', this.stopDialogDrag, { once: true });
  },
  handleDialogDrag(event) {
    if (!this.isDraggingDialog) return;
    const x = event.clientX - this.dragOffsetX;
    const y = event.clientY - this.dragOffsetY;
    this.contextMenu.dialogX = Math.max(0, Math.min(x, window.innerWidth - this.contextMenu.dialogWidth * window.innerWidth / 100));
    this.contextMenu.dialogY = Math.max(0, Math.min(y, window.innerHeight - this.contextMenu.dialogHeight * window.innerHeight / 100));
  },
  stopDialogDrag() {
    this.isDraggingDialog = false;
    document.removeEventListener('mousemove', this.handleDialogDrag);
  },
  startDialogResize(event) {
    this.isResizingDialog = true;
    const dialog = document.querySelector('.image-dialog');
    const rect = dialog.getBoundingClientRect();
    this.resizeOffsetX = event.clientX - rect.right;
    this.resizeOffsetY = event.clientY - rect.bottom;
    document.addEventListener('mousemove', this.handleDialogResize);
    document.addEventListener('mouseup', this.stopDialogResize, { once: true });
  },
  handleDialogResize(event) {
    if (!this.isResizingDialog) return;
    const newWidth = (event.clientX - this.resizeOffsetX - this.contextMenu.dialogX) / window.innerWidth * 100;
    const newHeight = (event.clientY - this.resizeOffsetY - this.contextMenu.dialogY) / window.innerHeight * 100;
    this.contextMenu.dialogWidth = Math.max(30, Math.min(newWidth, 80));
    this.contextMenu.dialogHeight = Math.max(40, Math.min(newHeight, 90));
  },
  stopDialogResize() {
    this.isResizingDialog = false;
    document.removeEventListener('mousemove', this.handleDialogResize);
  },
  updateImageProperties(imageId, property, value) {
    const image = this.project.images.find(img => img.id === imageId);
    if (image) {
      if (property === 'width' || property === 'height') {
        image[property] = Number(value);
        if (property === 'width') {
          image.height = Math.round((image.height / image.width) * value);
        } else {
          image.width = Math.round((image.width / image.height) * value);
        }
      } else if (property === 'baseOpacity') {
        image[property] = Math.min(100, Math.max(0, Number(value))) / 100;
      } else {
        image[property] = value;
      }
      this.updatePreview();
    }
  },
  zoomDialogImage(direction) {
    if (direction === 'in') {
      this.dialogZoom = Math.min(this.dialogZoom + 0.1, 3);
    } else {
      this.dialogZoom = Math.max(this.dialogZoom - 0.1, 0.5);
    }
  },
  getBlocksForRow(rowIndex) {
    if (!this.selectedImage) return [];
    return this.selectedImage.animationBlocks.filter(b => b.rowIndex === rowIndex);
  },
  getImageForBlock(block) {
    return this.project.images.find(img => img.id === block.imageId);
  },
  addAnimationBlock(type) {
    if (!this.selectedImage) return;
    const allBlocks = this.selectedImage.animationBlocks;
    let targetRow = 0;
    for (let i = 0; i < 3; i++) {
      const blocksOnRow = allBlocks.filter(b => b.rowIndex === i);
      const hasOverlap = blocksOnRow.some(b => (0 < b.startTime + b.duration) && (2 > b.startTime));
      if (!hasOverlap) {
        targetRow = i;
        break;
      }
    }
    const defaultParams = {
      pan: { direction: 'right', distance: 100, autoReverse: true },
      zoom: { startScale: 1, endScale: 1.5, autoReverse: true, useCenter: true, zoomX: 0, zoomY: 0 },
      rotate: { degrees: 90, autoReverse: false, useCenter: true, rotateX: 0, rotateY: 0 },
      opacity: { startOpacity: 1, endOpacity: 0, autoReverse: true },
    };
    const newBlock = {
      id: `anim_${Date.now()}`,
      type,
      startTime: 0,
      duration: 2,
      loop: true,
      rowIndex: targetRow,
      imageId: this.selectedImage.id,
      parameters: defaultParams[type],
    };
    this.selectedImage.animationBlocks.push(newBlock);
    this.selectBlock(newBlock);
    this.updatePreview();
  },
  deleteAnimationBlock(id) {
    this.project.images.forEach(img => {
      img.animationBlocks = img.animationBlocks.filter(b => b.id !== id);
    });
    if (this.selectedBlock && this.selectedBlock.id === id) {
      this.selectedBlock = null;
    }
    this.updatePreview();
  },
  selectBlock(block) {
    if (!block) return;
    const image = this.getImageForBlock(block);
    if (image) {
      const originalBlock = image.animationBlocks.find(b => b.id === block.id);
      if (originalBlock) {
        this.project.selectedImageId = image.id;
        this.selectedBlock = originalBlock;
        this.updatePreview();
      }
    }
  },
  onBlockDragStart(event, block) {
    event.dataTransfer.setData('text/plain', block.id);
    this.draggedBlockInfo = {
      block: block,
      offset: event.clientX - event.target.getBoundingClientRect().left
    };
    event.dataTransfer.effectAllowed = 'move';
  },
  onBlockDragOver(event) {
    event.preventDefault();
    if (!this.draggedBlockInfo || !this.$refs.timelineWrapper) return;
    
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    const rowHeight = timelineRect.height / 3;
    const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
    const dropY = event.clientY - timelineRect.top;
    
    const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
    const snappedTime = Math.max(0, Math.min(this.timelineDuration - this.draggedBlockInfo.block.duration, Math.round(rawTime * 10) / 10));
    const targetRowIndex = Math.min(2, Math.max(0, Math.floor(dropY / rowHeight)));
    
    this.dragPlaceholder = {
      visible: true,
      left: `${(snappedTime / this.timelineDuration) * 100}%`,
      width: `${(this.draggedBlockInfo.block.duration / this.timelineDuration) * 100}%`,
      top: `${targetRowIndex * rowHeight}px`,
      height: `${rowHeight}px`
    };
  },
  onBlockDragLeave(event) {
    if (!this.draggedBlockInfo || !this.$refs.timelineWrapper) return;
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    if (event.clientX <= timelineRect.left || event.clientX >= timelineRect.right || 
        event.clientY <= timelineRect.top || event.clientY >= timelineRect.bottom) {
      this.dragPlaceholder.visible = false;
    }
  },
  onBlockDrop(event) {
    event.preventDefault();
    if (!this.draggedBlockInfo || !this.$refs.timelineWrapper) return;
    
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    const rowHeight = timelineRect.height / 3;
    const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
    const dropY = event.clientY - timelineRect.top;
    
    const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
    const snappedTime = Math.max(0, Math.min(this.timelineDuration - this.draggedBlockInfo.block.duration, Math.round(rawTime * 10) / 10));
    const targetRowIndex = Math.min(2, Math.max(0, Math.floor(dropY / rowHeight)));
    
    const block = this.draggedBlockInfo.block;
    const image = this.getImageForBlock(block);
    if (image) {
      const blockToUpdate = image.animationBlocks.find(b => b.id === block.id);
      if (blockToUpdate) {
        const blocksOnRow = image.animationBlocks.filter(b => b.rowIndex === targetRowIndex && b.id !== block.id);
        const hasOverlap = blocksOnRow.some(b => 
          (snappedTime < b.startTime + b.duration) && 
          (snappedTime + block.duration > b.startTime)
        );
        if (hasOverlap) {
          this.overlapError = true;
          setTimeout(() => this.overlapError = false, 2000);
        } else {
          blockToUpdate.startTime = snappedTime;
          blockToUpdate.rowIndex = targetRowIndex;
          this.selectBlock(blockToUpdate);
          this.updatePreview();
        }
      }
    }
    
    this.draggedBlockInfo = null;
    this.dragPlaceholder.visible = false;
  }
};

async function init() {
  const [topUI, bottomUI] = await Promise.all([
    loadComponent('ui-top.html'),
    loadComponent('ui-bottom.html')
  ]);
  
  document.getElementById('app').innerHTML = `
    <div class="app-container">
      <div class="top-section">${topUI}</div>
      <div class="bottom-section">${bottomUI}</div>
      <div v-if="isRendering" class="loading-overlay">Rendering...</div>
    </div>
  `;
  
  createApp(App).mount('#app');
}

if (document.readyState === 'complete') init();
else window.addEventListener('DOMContentLoaded', init);
