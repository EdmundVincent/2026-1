export class ZoomController {
	constructor(options = {}) {
		this.globalState = options.globalState; 
		this.callbacks = options.callbacks || {};

		this.init();
		this.initializeElements();
	}

	init() {
		// 初期化処理
	}

	// === ヘルパーメソッド（共通処理） ===
    
	/**
	 * ズーム操作後の共通処理
	 */
	handleZoomChange() {
		this.rerenderCurrentPage();
		this.updateZoomControls();
		this.updateBboxFontSizeForZoom();
	}

	/**
	 * スケール値を境界内に制限して設定
	 */
	setScaleWithBounds(newScale) {
		const clampedScale = Math.max(
			this.globalState.minScale, 
			Math.min(newScale, this.globalState.maxScale)
		);
		this.globalState.setState('scale', clampedScale);
		return clampedScale;
	}

	/**
	 * スケール値が指定範囲内かチェック
	 */
	canZoom(direction) {
		if (direction === 'in') {
			return this.globalState.scale < this.globalState.maxScale;
		} else if (direction === 'out') {
			return this.globalState.scale > this.globalState.minScale;
		}
		return false;
	}

	// === 初期化メソッド ===

	initializeElements() {
		// ズームコントロール用の要素を取得
		this.zoomInBtn = document.getElementById('zoomIn');
		this.zoomOutBtn = document.getElementById('zoomOut');
		this.zoomResetBtn = document.getElementById('zoomReset');
		this.zoomLevel = document.getElementById('zoomLevel');

		// ズームコントロールイベント
		this.zoomInBtn.addEventListener('click', () => this.zoomIn());
		this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
		this.zoomResetBtn.addEventListener('click', () => this.zoomReset());
	}

	// === ズーム操作メソッド ===

	zoomIn() {
		if (this.canZoom('in')) {
			this.setScaleWithBounds(this.globalState.scale + this.globalState.scaleStep);
			this.handleZoomChange();
		}
	}
    
	zoomOut() {
		if (this.canZoom('out')) {
			this.setScaleWithBounds(this.globalState.scale - this.globalState.scaleStep);
			this.handleZoomChange();
		}
	}

	zoomReset() {
		this.globalState.setState('scale', this.globalState.defaultScale);
		this.handleZoomChange();
	}

	// === UI更新・レンダリングメソッド ===

	updateZoomControls() {
		// ズームレベルを%で表示
		const percentage = Math.round((this.globalState.scale / this.globalState.defaultScale) * 100);
		this.zoomLevel.textContent = `${percentage}%`;
        
		// ボタンの有効/無効状態を更新
		this.zoomInBtn.disabled = !this.canZoom('in');
		this.zoomOutBtn.disabled = !this.canZoom('out');
	}

	rerenderCurrentPage() {
		if (this.globalState.pdfDoc && this.globalState.currentPage) {
			this.callbacks.renderPage(this.globalState.currentPage);
		}
	}

	// bbox英訳テキストのフォントサイズをズーム率に合わせて更新（最適化版）
	updateBboxFontSizeForZoom() {
		// 右側のbboxの英訳テキストのフォントサイズをズーム率に合わせて調整
		const rightBboxes = document.querySelectorAll('.canvas-container.right .ocr-box.japanese-text');
		const zoomRatio = this.globalState.scale / this.globalState.defaultScale;
        
		// DocumentFragmentを使って効率的に更新
		if (rightBboxes.length > 0) {
			// 一時的にCSSを無効化してリフローを抑制
			document.body.style.pointerEvents = 'none';
            
			rightBboxes.forEach(box => {
				const bboxId = box.dataset.bboxId;
				if (bboxId) {
					// 元のカスタムフォントサイズを取得
					const baseFontSize = this.bboxManager?.getBboxFontSize ? this.bboxManager.getBboxFontSize(bboxId) : 12;
					// ズーム率を適用したフォントサイズを計算
					const scaledFontSize = baseFontSize * zoomRatio;

					// CSSカスタムプロパティを使用して効率的に更新
					box.style.setProperty('--scaled-font-size', `${scaledFontSize}px`);
					box.style.setProperty('--scaled-line-height', `${scaledFontSize * 1.2}px`);
                    
					// フォントサイズと行間を更新
					box.style.fontSize = `var(--scaled-font-size, ${scaledFontSize}px)`;
					box.style.lineHeight = `var(--scaled-line-height, ${scaledFontSize * 1.2}px)`;
				}
			});
            
			// ポインターイベントを再有効化
			requestAnimationFrame(() => {
				document.body.style.pointerEvents = '';
			});
		}
	}

	// === ゲッター・セッターメソッド ===

	setDefaultScale() {
		this.globalState.setState('scale', this.globalState.defaultScale);
	}

	getScale() {
		return this.globalState.scale;
	}

	getDefaultScale() {
		return this.globalState.defaultScale;
	}

}

