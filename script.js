const { createApp } = PetiteVue;

const BACKEND_URL = 'https://swa-exporter.up.railway.app'; 

function App() {
  return {
    // --- STATE ---
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
    dragOverItemId: null,
    contextMenu: { visible: false, x: 0, y: 0, targetId: null },
    livePreviewSvgUrl: '',
    timelineWrapper: null,
    dropPlaceholder: { visible: false, style: {} },

    // --- COMPUTED ---
    get sortedImages() {
      return [...this.project.images].sort((a, b) => a.order - b.order);
    },
    get selectedImage() {
      return this.project.images.find(img => img.id === this.project.selectedImageId) || null;
    },
    get isSafari() {
      return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    },
    get timelineMarks() {
      const seconds = [], tenths = [], numSeconds = Math.floor(this.timelineDuration);
      for (let i = 0; i <= this.timelineDuration * 10; i++) {
        if (i % 10 !== 0) tenths.push(i * 100 / (this.timelineDuration * 10));
      }
      for (let i = 0; i <= numSeconds; i++) {
        seconds.push({ pos: (i / this.timelineDuration) * 100, label: i });
      }
      return { seconds, tenths };
    },
    
    // --- METHODS ---
    updatePreview() {
      const svgContent = this.getSvgString();
      if (this.livePreviewSvgUrl) { URL.revokeObjectURL(this.livePreviewSvgUrl); }
      if (!svgContent) { this.livePreviewSvgUrl = ''; return; };
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      this.livePreviewSvgUrl = URL.createObjectURL(blob);
    },
    getSvgString() {
        const { projectWidth, projectHeight, images } = this.project;
        if (images.length === 0) return '';
        const imagesToRender = [...this.project.images].sort((a, b) => b.order - a.order);
        const canvasCenterX = projectWidth / 2;
        const canvasCenterY = projectHeight / 2;
        const imageElements = imagesToRender.map(image => {
            let animationTransforms = [];
            let animationFilters = [];
            let groupStyles = [];

            image.animationBlocks.forEach(block => {
                const repeatCount = block.loop ? 'indefinite' : '1';
                const { parameters } = block;
                switch (block.type) {
                    case 'pan': {
                        const { direction, distance, autoReverse } = parameters;
                        const to = { right: `${distance} 0`, left: `${-distance} 0`, up: `0 ${-distance}`, down: `0 ${distance}` }[direction];
                        const anim = autoReverse ? `<animateTransform attributeName="transform" type="translate" values="0 0; ${to}; 0 0" keyTimes="0; 0.5; 1" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" additive="sum" />`
                                           : `<animateTransform attributeName="transform" type="translate" from="0 0" to="${to}" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" additive="sum" />`;
                        animationTransforms.push(anim);
                        break;
                    }
                    case 'zoom': {
                        if (!parameters.useCenter) { groupStyles.push(`transform-origin: ${parameters.centerX}px ${parameters.centerY}px;`); }
                        const { startScale, endScale, autoReverse } = parameters;
                        const anim = autoReverse ? `<animateTransform attributeName="transform" type="scale" values="${startScale}; ${endScale}; ${startScale}" keyTimes="0; 0.5; 1" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" additive="sum" />`
                                           : `<animateTransform attributeName="transform" type="scale" from="${startScale}" to="${endScale}" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" additive="sum" />`;
                        animationTransforms.push(anim);
                        break;
                    }
                    case 'rotate': {
                        const { degrees, autoReverse, useCenter, rotateX, rotateY } = parameters;
                        const cx = useCenter ? canvasCenterX : rotateX;
                        const cy = useCenter ? canvasCenterY : rotateY;
                        const anim = autoReverse ? `<animateTransform attributeName="transform" type="rotate" values="0 ${cx} ${cy}; ${degrees} ${cx} ${cy}; 0 ${cx} ${cy}" keyTimes="0; 0.5; 1" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" />`
                                           : `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="${degrees} ${cx} ${cy}" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" />`;
                        animationTransforms.push(anim);
                        break;
                    }
                    case 'opacity': {
                        const { startOpacity, endOpacity, autoReverse } = parameters;
                        const anim = autoReverse ? `<animate attributeName="opacity" values="${startOpacity}; ${endOpacity}; ${startOpacity}" keyTimes="0; 0.5; 1" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" fill="freeze" />`
                                           : `<animate attributeName="opacity" from="${startOpacity}" to="${endOpacity}" begin="${block.startTime}s" dur="${block.duration}s" repeatCount="${repeatCount}" fill="freeze" />`;
                        animationFilters.push(anim);
                        break;
                    }
                }
            });
            return `<g style="${groupStyles.join(' ')}"><image href="${image.base64Data}" width="${projectWidth}" height="${projectHeight}" x="0" y="0">${animationFilters.join('')}</image>${animationTransforms.join('')}</g>`;
        }).join('');
        return `<svg width="${projectWidth}" height="${projectHeight}" xmlns="http://www.w3.org/2000/svg"><style>g{transform-box:fill-box;transform-origin:center;}</style><defs><clipPath id="canvas-clip"><rect x="0" y="0" width="${projectWidth}" height="${projectHeight}" /></clipPath></defs><g clip-path="url(#canvas-clip)">${imageElements}</g></svg>`;
    },
    getBlocksForRow(rowIndex) {
      if (!this.selectedImage) return [];
      const rows = [[], [], []];
      const sortedBlocks = [...this.selectedImage.animationBlocks].sort((a, b) => a.startTime - b.startTime);
      for (const block of sortedBlocks) {
          let placed = false;
          for (let i = 0; i < 3; i++) {
              const hasOverlap = rows[i].some(b => (block.startTime < b.startTime + b.duration) && (block.startTime + block.duration > b.startTime));
              if (!hasOverlap) { rows[i].push(block); placed = true; break; }
          }
          if (!placed) { rows[0].push(block); }
      }
      return rows[rowIndex];
    },
    async handleImageUpload(e) {
      const files = e.target.files;
      if (this.project.images.length + files.length > 10) { alert("Error: You can upload a maximum of 10 images."); return; }
      const readPromises = [...files].map((file, i) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve({ id: `img_${Date.now()}_${i}`, name: file.name, base64Data: event.target.result, order: this.project.images.length + i, animationBlocks: [] });
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
      }));
      try {
          const newImages = await Promise.all(readPromises);
          this.project.images.push(...newImages); this.updatePreview();
      } catch (error) { console.error("Error reading files:", error); alert("There was an error loading one or more images."); }
    },
    selectImage(id) { this.project.selectedImageId = id; this.selectedBlock = null; },
    deleteImage(id) {
        const imgIdx = this.project.images.findIndex(p => p.id === id);
        if (imgIdx === -1) return;
        const deletedOrder = this.project.images[imgIdx].order;
        this.project.images.splice(imgIdx, 1);
        this.project.images.forEach(img => { if (img.order > deletedOrder) img.order--; });
        if (this.project.selectedImageId === id) this.project.selectedImageId = null;
        this.updatePreview();
    },
    saveProject() {
      const projectJSON = JSON.stringify(this.project);
      localStorage.setItem('webpAnimatorProject', projectJSON);
      const blob = new Blob([projectJSON], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'my-animation-project.json'; a.click(); URL.revokeObjectURL(a.href);
    },
    handleProjectLoad(e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              this.project = JSON.parse(event.target.result);
              this.selectImage(this.project.selectedImageId || null); this.updatePreview();
          } catch { alert('Error parsing project file.'); }
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
      if (!BACKEND_URL || BACKEND_URL === 'PASTE_YOUR_RAILWAY_URL_HERE') { alert('Backend URL is not configured.'); return; }
      this.isRendering = true;
      try {
          const svgData = this.getSvgString();
          const response = await fetch(`${BACKEND_URL}/api/render-${format}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ svg: svgData })
          });
          if (!response.ok) { throw new Error(`Server responded with status: ${response.status} ${await response.text()}`); }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none'; a.href = url; a.download = `animation.${format}`;
          document.body.appendChild(a); a.click();
          URL.revokeObjectURL(url); document.body.removeChild(a);
      } catch (error) {
          console.error('Export failed:', error); alert(`Export failed: ${error.message}`);
      } finally { this.isRendering = false; }
    },
    onImageDragStart(id) { this.draggedItemId = id; },
    onImageDragOver(id) { this.dragOverItemId = id; },
    onImageDragLeave() { this.dragOverItemId = null; },
    onImageDrop(targetId) {
        if (!this.draggedItemId || this.draggedItemId === targetId) { this.draggedItemId = null; this.dragOverItemId = null; return; }
        const draggedImage = this.project.images.find(p => p.id === this.draggedItemId);
        const targetImage = this.project.images.find(p => p.id === targetId);
        if (draggedImage && targetImage) {
            const draggedOrder = draggedImage.order;
            draggedImage.order = targetImage.order;
            targetImage.order = draggedOrder;
            this.project.images.sort((a,b) => a.order - b.order);
        }
        this.draggedItemId = null; this.dragOverItemId = null;
        this.updatePreview();
    },
    openContextMenu(event, imageId) {
      this.contextMenu.targetId = imageId; this.contextMenu.x = event.clientX; this.contextMenu.y = event.clientY;
      this.contextMenu.visible = true;
      window.addEventListener('click', this.closeContextMenu, { once: true });
    },
    closeContextMenu() { this.contextMenu.visible = false; },
    addAnimationBlock(type) {
      if (!this.selectedImage) return;
      const isLoopingByDefault = ['pan', 'zoom', 'rotate', 'opacity'].includes(type);
      const defaultParams = {
          pan: { direction: 'right', distance: 100, autoReverse: true },
          zoom: { startScale: 1, endScale: 1.5, autoReverse: false, useCenter: true, centerX: 0, centerY: 0 },
          rotate: { degrees: 360, autoReverse: false, useCenter: true, rotateX: 0, rotateY: 0 },
          opacity: { startOpacity: 1, endOpacity: 0, autoReverse: true },
      };
      const newBlock = { id: `anim_${Date.now()}`, type, startTime: 0, duration: 2, loop: isLoopingByDefault, parameters: defaultParams[type] };
      this.selectedImage.animationBlocks.push(newBlock);
      this.selectBlock(newBlock);
      this.updatePreview();
    },
    deleteAnimationBlock(id) {
      if (!this.selectedImage) return;
      this.selectedImage.animationBlocks = this.selectedImage.animationBlocks.filter(b => b.id !== id);
      if (this.selectedBlock && this.selectedBlock.id === id) { this.selectedBlock = null; }
      this.updatePreview();
    },
    selectBlock(block) { this.selectedBlock = block; },
    onBlockDragStart(event, block) {
        const rect = event.target.getBoundingClientRect();
        this.draggedBlockInfo = { blockId: block.id, duration: block.duration, offset: event.clientX - rect.left, };
        event.dataTransfer.setData('text/plain', block.id);
        event.dataTransfer.effectAllowed = 'move';
    },
    onBlockDragOver(event) {
        if (!this.draggedBlockInfo || !this.$refs.timelineWrapper) return;
        const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
        const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
        const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
        const snappedTime = Math.max(0, Math.round(rawTime * 10) / 10);
        const dropY = event.clientY - timelineRect.top;
        const rowHeight = timelineRect.height / 3;
        const targetRowIndex = Math.min(2, Math.floor(dropY / rowHeight));
        this.dropPlaceholder.visible = true;
        this.dropPlaceholder.style = {
            left: `${(snappedTime / this.timelineDuration) * 100}%`,
            width: `${(this.draggedBlockInfo.duration / this.timelineDuration) * 100}%`,
            top: `${targetRowIndex * 33.33}%`,
        };
    },
    onBlockDragLeave(event) {
        if (this.$refs.timelineWrapper.contains(event.relatedTarget)) return;
        this.dropPlaceholder.visible = false; 
    },
    onBlockDrop(event) {
        this.dropPlaceholder.visible = false;
        if (!this.draggedBlockInfo || !this.selectedImage || !this.$refs.timelineWrapper) return;
        const draggedBlock = this.selectedImage.animationBlocks.find(b => b.id === this.draggedBlockInfo.blockId);
        if (!draggedBlock) return;
        const timelineRect = this.$refs.timelineWrapper.getBoundingClientRect();
        const dropX = event.clientX - timelineRect.left - this.draggedBlockInfo.offset;
        const rawTime = (dropX / timelineRect.width) * this.timelineDuration;
        const snappedTime = Math.max(0, Math.round(rawTime * 10) / 10);
        const rowHeight = timelineRect.height / 3;
        const dropY = event.clientY - timelineRect.top;
        const targetRowIndex = Math.min(2, Math.floor(dropY / rowHeight));
        const targetRow = this.getBlocksForRow(targetRowIndex);
        const hasOverlap = targetRow.some(b => b.id !== draggedBlock.id && (snappedTime < b.startTime + b.duration) && (snappedTime + draggedBlock.duration > b.startTime));
        if (!hasOverlap) { draggedBlock.startTime = snappedTime; } 
        else { this.overlapError = true; setTimeout(() => this.overlapError = false, 2000); }
        this.updatePreview();
        this.draggedBlockInfo = null;
    },
    mounted() {
      this.timelineWrapper = this.$refs.timelineWrapper;
      const savedProject = localStorage.getItem('webpAnimatorProject');
      if (savedProject) {
          try { this.project = JSON.parse(savedProject); } 
          catch { localStorage.removeItem('webpAnimatorProject'); }
      }
      this.updatePreview();
    }
  }
}
createApp(App()).mount('#app');
</script>
</html>
