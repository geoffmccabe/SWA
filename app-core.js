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
  contextMenu: { visible: false, x: 0, y: 0, targetId: null },
  livePreviewSvgUrl: '',
  dragPlaceholder: { visible: false, left: '0px', width: '0px', top: '0px', height: '0px' },
  contextMenuX: 0,
  contextMenuY: 0,
  blockStartTime: 0,
  blockDuration: 0,
  placeholderLeft: 0,
  placeholderWidth: 0,
  placeholderTop: 0,
  placeholderHeight: 0,

  get sortedImages() {
    return [...this.project.images].sort((a, b) => a.order - b.order);
  },
  get selectedImage() {
    if (!this.project.selectedImageId) return null;
    return this.project.images.find(img => img.id === this.project.selectedImageId);
  },
  get isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
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
  get animationBlockStyles() {
    return (block) => ({
      left: `${(block.startTime / this.timelineDuration) * 100}%`,
      width: `${(block.duration / this.timelineDuration) * 100}%`
    });
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
    const canvasCenterX = projectWidth / 2;
    const canvasCenterY = projectHeight / 2;
    const imageElements = imagesToRender.map(image => {
      const animationElements = image.animationBlocks.map(block => {
        const repeatCount = block.loop ? 'indefinite' : '1';
        let animations = '';
        const blockStartTime = block.startTime;
        const blockDuration = block.duration;
        switch (block.type) {
          case 'pan': {
            const { direction, distance, autoReverse } = block.parameters;
            const pans = { right: `${distance} 0`, left: `${-distance} 0`, up: `0 ${-distance}`, down: `0 ${distance}` };
            const to = pans[direction];
            animations += `<animateTransform attributeName="transform" type="translate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="0 0; ${to}; 0 0" keyTimes="0; 0.5; 1"` : `from="0 0" to="${to}"`} />`;
            break;
          }
          case 'zoom': {
            const { startScale, endScale, autoReverse, useCenter, zoomX, zoomY } = block.parameters;
            const cx = useCenter ? canvasCenterX : zoomX;
            const cy = useCenter ? canvasCenterY : zoomY;
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
            const cx = useCenter ? canvasCenterX : rotateX;
            const cy = useCenter ? canvasCenterY : rotateY;
            const from = `0 ${cx} ${cy}`;
            const to = `${degrees} ${cx} ${cy}`;
            animations += `<animateTransform attributeName="transform" type="rotate" additive="sum" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${from}; ${to}; ${from}" keyTimes="0; 0.5; 1"` : `from="${from}" to="${to}"`} />`;
            break;
          }
          case 'opacity': {
            const { startOpacity, endOpacity, autoReverse } = block.parameters;
            animations += `<animate attributeName="opacity" fill="freeze" begin="${blockStartTime}s" dur="${blockDuration}s" repeatCount="${repeatCount}" ${autoReverse ? `values="${startOpacity}; ${endOpacity}; ${startOpacity}" keyTimes="0; 0.5; 1"` : `from="${startOpacity}" to="${endOpacity}"`} />`;
            break;
          }
        }
        return animations;
      }).join('');
      return `<g>${animationElements}<image href="${image.base64Data}" width="${projectWidth}" height="${projectHeight}" x="0" y="0" /></g>`;
    }).join('');
    return `<svg width="${projectWidth}" height="${projectHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><clipPath id="canvas-clip"><rect x="0" y="0" width="${projectWidth}" height="${projectHeight}" /></clipPath></defs><g clip-path="url(#canvas-clip)">${imageElements}</g></svg>`;
  },
  async handleImageUpload(e) {
    const files = e.target.files;
    if (this.project.images.length + files.length > 10) { alert("Error: You can upload a maximum of 10 images."); return; }
    const readPromises = [...files].map((file, i) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve({
          id: `img_${Date.now()}_${i}`, name: file.name, base64Data: event.target.result,
          order: this.project.images.length + i, animationBlocks: [],
        });
        reader.onerror = (error) => reject(error);
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
  selectImage(id) { this.project.selectedImageId = id; this.selectedBlock = null; },
  deleteImage(id) {
    const imageToDelete = this.project.images.find(img => img.id === id);
    if (!imageToDelete) return;
    const deletedOrder = imageToDelete.order;
    this.project.images = this.project.images.filter(img => img.id !== id);
    this.project.images.forEach(img => { if (img.order > deletedOrder) img.order--; });
    if (this.project.selectedImageId === id) {
      this.project.selectedImageId = this.project.images.length > 0 ? this.sortedImages[0].id : null;
    }
    this.updatePreview();
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
    this.contextMenu.targetId = imageId;
    this.contextMenu.x = event.clientX;
    this.contextMenu.y = event.clientY;
    this.contextMenu.visible = true;
    window.addEventListener('click', this.closeContextMenu, { once: true });
  },
  closeContextMenu() { this.contextMenu.visible = false; },
  getBlocksForRow(rowIndex) {
    const allBlocks = this.project.images.flatMap(img =>
      img.animationBlocks.map(b => ({...b, imageId: img.id}))
    );
    return allBlocks.filter(b => b.rowIndex === rowIndex);
  },
  getImageForBlock(block) {
    return this.project.images.find(img => img.id === block.imageId);
  },
  addAnimationBlock(type) {
    if (!this.selectedImage) return;
    const allBlocks = this.project.images.flatMap(img => img.animationBlocks);
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
      id: `anim_${Date.now()}`, type, startTime: 0, duration: 2, loop: true,
      rowIndex: targetRow,
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
    if (this.selectedBlock && this.selectedBlock.id === id) { this.selectedBlock = null; }
    this.updatePreview();
  },
  selectBlock(block) {
    const image = this.getImageForBlock(block);
    if (image) {
      const originalBlock = image.animationBlocks.find(b => b.id === block.id);
      if (originalBlock) {
        this.project.selectedImageId = image.id;
        this.selectedBlock = originalBlock;
      }
    }
  },
  onBlockDragStart(event, block) {
    const rect = event.target.getBoundingClientRect();
    this.draggedBlockInfo = {
      block: block,
      offset: event.clientX - rect.left,
    };
    event.dataTransfer.setData('text/plain', block.id);
    event.dataTransfer.effectAllowed = 'move';
  },
  onBlockDragOver(event) {
    if (!this.draggedBlockInfo) return;
    event.preventDefault();
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    const rowHeight = timelineRect.height / 3;
    const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
    const dropY = event.clientY - timelineRect.top;
    const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
    const snappedTime = Math.max(0, Math.round(rawTime * 10) / 10);
    const targetRowIndex = Math.min(2, Math.floor(dropY / rowHeight));
    this.dragPlaceholder.visible = true;
    this.dragPlaceholder.left = `${(snappedTime / this.timelineDuration) * 100}%`;
    this.dragPlaceholder.width = `${(this.draggedBlockInfo.block.duration / this.timelineDuration) * 100}%`;
    this.dragPlaceholder.top = `${targetRowIndex * rowHeight + 1}px`;
    this.dragPlaceholder.height = `${rowHeight - 2}px`;
  },
  onBlockDragLeave(event) {
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    if (event.clientX <= timelineRect.left || event.clientX >= timelineRect.right || event.clientY <= timelineRect.top || event.clientY >= timelineRect.bottom) {
      this.dragPlaceholder.visible = false;
    }
  },
  onBlockDrop(event) {
    if (!this.draggedBlockInfo) return;
    this.dragPlaceholder.visible = false;
    const draggedBlock = this.draggedBlockInfo.block;
    const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
    const rowHeight = timelineRect.height / 3;
    const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
    const dropY = event.clientY - timelineRect.top;
    const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
    const snappedTime = Math.max(0, Math.round(rawTime * 10) / 10);
    const targetRowIndex = Math.min(2, Math.floor(dropY / rowHeight));
    const allBlocksOnTargetRow = this.project.images.flatMap(img => img.animationBlocks).filter(b => b.rowIndex === targetRowIndex);
    const hasOverlap = allBlocksOnTargetRow.some(b =>
      b.id !== draggedBlock.id &&
      (snappedTime < b.startTime + b.duration) &&
      (snappedTime + draggedBlock.duration > b.startTime)
    );
    if (hasOverlap) {
      this.overlapError = true;
      setTimeout(() => this.overlapError = false, 2000);
    } else {
      const imageOfBlock = this.getImageForBlock(draggedBlock);
      const blockToUpdate = imageOfBlock.animationBlocks.find(b => b.id === draggedBlock.id);
      if (blockToUpdate) {
        blockToUpdate.startTime = snappedTime;
        blockToUpdate.rowIndex = targetRowIndex;
        this.selectBlock(blockToUpdate);
        this.updatePreview();
      }
    }
    this.draggedBlockInfo = null;
  }
};

async function init() {
  const [topUI, bottomUI] = await Promise.all([
    loadComponent('ui-top.html'),
    loadComponent('ui-bottom.html')
  ]);
  
  document.getElementById('app').innerHTML = `
    <div v-scope="App">
      ${topUI}
      ${bottomUI}
    </div>
  `;
  
  createApp(App).mount('#app');
}

if (document.readyState === 'complete') init();
else window.addEventListener('DOMContentLoaded', init);
