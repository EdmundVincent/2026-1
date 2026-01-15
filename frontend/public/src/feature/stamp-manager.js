import { Utils } from '../utils/utils.js';
import { BaseManager } from '../utils/base-manager.js';

export class StampManager {
	// === 初期化・設定系 ===
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.callbacks = options.callbacks || {};

		this.init();
		this.initializeElements();
		this.initializeEvents();
	}

	init() {
		// 初期化処理
	}

	initializeElements() {
		this.stampModeButton = document.getElementById('stampModeButton');
		this.clearStampsButton = document.getElementById('clearStampsButton');
		this.canvasRight = document.getElementById('pdfCanvasRight');
		this.ctxRight = this.canvasRight.getContext('2d');
		this.overlayRight = document.getElementById('overlayRight');
	}

	initializeEvents() {
		// スタンプクリアボタンのイベントリスナー
		this.clearStampsButton.addEventListener('click', () => this.clearCurrentPageStamps());
        
		// 右側キャンバスのマウスイベント（スタンプ描画用）
		this.canvasRight.addEventListener('click', (e) => this.handleCanvasStampClick(e));
		this.canvasRight.addEventListener('mousemove', (e) => this.handleCanvasStampMouseMove(e));
        
		// documentレベルのクリックイベント（canvas外クリック検出用）
		document.addEventListener('click', (e) => this.handleDocumentClick(e));
        
		// オーバーレイのマウスイベント（既存の機能との互換性のため）
		this.overlayRight.addEventListener('click', (e) => this.handleStampClick(e));
		this.overlayRight.addEventListener('mousemove', (e) => this.handleStampMouseMove(e));
	}

	getClearStampsButton() {
		return this.clearStampsButton;
	}

	setCtxRight(ctxRight) {
		this.ctxRight = ctxRight;
	}

	// === 描画系ヘルパー ===
	/**
	 * スタンプ描画スタイルの共通設定
	 */
	configureStampStyle(ctx, isPreview = false, isInvalid = false) {
		ctx.save();
        
		if (isPreview && isInvalid) {
			ctx.strokeStyle = '#dc3545';
			ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
			ctx.setLineDash([8, 4]); // 点線
		} else if (isPreview) {
			ctx.strokeStyle = '#007bff';
			ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
			ctx.setLineDash([8, 4]); // 点線
		} else {
			ctx.strokeStyle = '#007bff';
			ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
		}
        
		ctx.lineWidth = 2;
	}

	/**
	 * スタンプテキストを描画
	 */
	drawStampText(ctx, x, y, width, text) {
		if (!text || width <= 30) return;
        
		ctx.fillStyle = 'white';
		ctx.strokeStyle = '#007bff';
		ctx.lineWidth = 1;
		ctx.font = '12px Arial';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
        
		const textX = x + width / 2;
		const textY = y - 2;
		const textMetrics = ctx.measureText(text);
		const textWidth = textMetrics.width + 8;
		const textHeight = 16;
        
		// 背景の矩形を描画
		ctx.fillRect(textX - textWidth / 2, textY - textHeight, textWidth, textHeight);
		ctx.strokeRect(textX - textWidth / 2, textY - textHeight, textWidth, textHeight);
        
		// テキスト描画
		ctx.fillStyle = '#007bff';
		ctx.fillText(text, textX, textY - 2);
	}

	drawStampOnCanvas(ctx, x, y, width, height, text, isPreview = false) {
		this.configureStampStyle(ctx, isPreview);
        
		// 四角の描画
		ctx.fillRect(x, y, width, height);
		ctx.strokeRect(x, y, width, height);
        
		// テキストの描画
		this.drawStampText(ctx, x, y, width, text);
        
		ctx.restore();
	}
    
	/**
	 * プレビューCanvas設定と取得
	 */
	ensurePreviewCanvas() {
		if (!this.previewCanvas) {
			this.previewCanvas = document.createElement('canvas');
			this.previewCanvas.style.position = 'absolute';
			this.previewCanvas.style.top = '0';
			this.previewCanvas.style.left = '0';
			this.previewCanvas.style.pointerEvents = 'none';
			this.previewCanvas.style.zIndex = '10';
			this.canvasRight.parentElement.appendChild(this.previewCanvas);
			this.previewCtx = this.previewCanvas.getContext('2d');
		}
        
		// canvasサイズを合わせる
		this.previewCanvas.width = this.canvasRight.width;
		this.previewCanvas.height = this.canvasRight.height;
        
		return this.previewCtx;
	}

	// 点線プレビュー描画（軽量版）
	drawStampPreview(x, y, width, height, isInvalid = false) {
		// 既存のプレビューを削除
		this.clearStampPreview();
        
		const previewCtx = this.ensurePreviewCanvas();
        
		// 点線スタイルを設定
		this.configureStampStyle(previewCtx, true, isInvalid);
        
		// 点線の四角形を描画
		previewCtx.fillRect(x, y, width, height);
		previewCtx.strokeRect(x, y, width, height);
        
		// プレビューテキストを表示（サイズが十分な場合のみ）
		if (width > 50 && height > 20 && !isInvalid) {
			previewCtx.setLineDash([]); // 実線に戻す
			previewCtx.fillStyle = '#007bff';
			previewCtx.font = '12px Arial';
			previewCtx.textAlign = 'center';
			previewCtx.textBaseline = 'middle';
		}
        
		previewCtx.restore();
	}
    
	// プレビューをクリア
	clearStampPreview() {
		if (this.previewCanvas && this.previewCtx) {
			this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
		}
	}

	// === スタンプ管理系ヘルパー ===
	/**
	 * 現在のページのスタンプを取得
	 */
	getCurrentPageStamps() {
		return this.globalState.canvasStamps.filter(stamp => stamp.pageNum === this.globalState.currentPage);
	}

	/**
	 * スタンプを再描画（現在のページのみ）
	 */
	redrawStampsOnly() {
		if (!this.globalState.canvasStamps?.length) return;
        
		this.getCurrentPageStamps().forEach(stamp => {
			this.drawStampOnCanvas(this.ctxRight, stamp.x, stamp.y, stamp.width, stamp.height, stamp.text);
		});
	}

	// canvas再描画（現在のページのスタンプのみ）
	redrawCanvasWithStamps() {
		// 現在のページを再描画
		this.callbacks.renderPage(this.globalState.currentPage);

		// 現在のページのスタンプのみを再描画
		this.redrawStampsOnly();

		// プレビューもクリア
		this.clearStampPreview();
	}

	// 現在のページのスタンプのみを再描画（PDF renderer用）
	redrawCurrentPageStamps() {
		this.redrawStampsOnly();
	}
	// 現在のページのスタンプのみクリア
	clearCurrentPageStamps() {
		const currentPageStamps = this.getCurrentPageStamps();
        
		if (currentPageStamps.length === 0) {
			return;
		}
        
		// 現在のページのスタンプを削除
		this.globalState.canvasStamps = this.globalState.canvasStamps.filter(stamp => stamp.pageNum !== this.globalState.currentPage);
        
		// canvas再描画
		this.redrawCanvasWithStamps();
        
		// クリアボタンを無効化
		this.clearStampsButton.disabled = true;
	}

	// ページ変更時にスタンプ表示を更新
	updateStampsOnPageChange(pageNum) {
		// 一時的に現在のページを変更してフィルタリング
		const originalPage = this.globalState.currentPage;
		this.globalState.currentPage = pageNum;
        
		// クリアボタンの状態を更新
		const pageStamps = this.getCurrentPageStamps();
		this.clearStampsButton.disabled = pageStamps.length === 0;
        
		// 元のページに戻す
		this.globalState.currentPage = originalPage;
	}

	cancelCurrentStamp() {
		if (this.globalState.currentStampOverlay && this.globalState.currentStampOverlay.parentNode) {
			this.globalState.currentStampOverlay.parentNode.removeChild(this.globalState.currentStampOverlay);
		}
		this.globalState.currentStampOverlay = null;
        
		this.resetStampState();
        
		// Canvas プレビューもクリア
		this.redrawCanvasWithStamps();
	}

	// === イベントハンドラー系ヘルパー ===
    
	/**
	 * マウス座標から相対座標を計算
	 */
	getRelativeCoordinates(event, element) {
		const rect = element.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
	}

	/**
	 * 四角形の位置とサイズを計算
	 */
	calculateRectangle(startX, startY, endX, endY) {
		return {
			left: Math.min(startX, endX),
			top: Math.min(startY, endY),
			width: Math.abs(endX - startX),
			height: Math.abs(endY - startY)
		};
	}

	/**
	 * スタンプサイズの有効性チェック
	 */
	isValidStampSize(width, height, minSize = 20) {
		return width >= minSize && height >= minSize;
	}

	/**
	 * スタンプデータを作成
	 */
	createStampData(x, y, width, height, text = 'Used for work preparation') {
		return {
			x,
			y,
			width,
			height,
			text,
			id: Date.now() + Math.random(),
			pageNum: this.globalState.currentPage
		};
	}

	/**
	 * スタンプ作成を完了
	 */
	completeStampCreation(rect) {
		const stampData = this.createStampData(rect.left, rect.top, rect.width, rect.height);
		this.globalState.canvasStamps.push(stampData);
        
		// canvas再描画
		this.redrawCanvasWithStamps();
        
		// プレビューをクリア
		this.clearStampPreview();
        
		// クリアボタンを有効化
		this.clearStampsButton.disabled = false;
        
		// スタンプモードを自動的に解除
		this.disableStampMode();
	}

	/**
	 * スタンプ状態をリセット
	 */
	resetStampState() {
		this.globalState.isFirstClickDone = false;
		this.clearStampPreview();
	}

	// Canvas用のイベントハンドラー（メイン機能）
	handleCanvasStampClick(event) {
		if (!this.globalState.isStampMode) return;
        
		event.preventDefault();
        
		const coords = this.getRelativeCoordinates(event, this.canvasRight);

		if (!this.globalState.isFirstClickDone) {
			// 1回目のクリック：開始点を設定
			this.globalState.isFirstClickDone = true;
			this.globalState.firstClickX = coords.x;
			this.globalState.firstClickY = coords.y;
            
			// プレビューをクリア
			this.clearStampPreview();
		} else {
			// 2回目のクリック：終了点を設定して四角を描画
			const rect = this.calculateRectangle(
				this.globalState.firstClickX, 
				this.globalState.firstClickY, 
				coords.x, 
				coords.y
			);
            
			// 最小サイズチェック
			if (!this.isValidStampSize(rect.width, rect.height)) {
				this.resetStampState();
				this.redrawCanvasWithStamps(); // プレビューを消去
				return;
			}
            
			this.completeStampCreation(rect);
		}
	}

	handleCanvasStampMouseMove(event) {
		if (!this.globalState.isStampMode || !this.globalState.isFirstClickDone) return;
        
		event.preventDefault();
        
		// スロットリング: 60fps相当の制限
		const now = Date.now();
		if (this.lastCanvasMouseMoveTime && (now - this.lastCanvasMouseMoveTime) < 16) {
			return;
		}
		this.lastCanvasMouseMoveTime = now;
        
		const coords = this.getRelativeCoordinates(event, this.canvasRight);
		const rect = this.calculateRectangle(
			this.globalState.firstClickX, 
			this.globalState.firstClickY, 
			coords.x, 
			coords.y
		);
        
		// 青い点線でプレビュー
		this.drawStampPreview(rect.left, rect.top, rect.width, rect.height, false);
	}
	// Overlay用のイベントハンドラー（既存機能との互換性のため）
	handleStampClick(event) {
		if (!this.globalState.isStampMode) return;
        
		event.preventDefault();
        
		const coords = this.getRelativeCoordinates(event, this.overlayRight);

		if (!this.globalState.isFirstClickDone) {
			// 1回目のクリック：開始点を設定
			this.globalState.isFirstClickDone = true;
			this.globalState.firstClickX = coords.x;
			this.globalState.firstClickY = coords.y;

			// 新しいスタンプオーバーレイを作成（プレビュー用）
			this.globalState.currentStampOverlay = document.createElement('div');
			this.globalState.currentStampOverlay.className = 'stamp-overlay';
			this.globalState.currentStampOverlay.style.left = `${coords.x}px`;
			this.globalState.currentStampOverlay.style.top = `${coords.y}px`;
			this.globalState.currentStampOverlay.style.width = '0px';
			this.globalState.currentStampOverlay.style.height = '0px';

			// オーバーレイに追加
			this.overlayRight.appendChild(this.globalState.currentStampOverlay);
		} else {
			// 2回目のクリック：終了点を設定して四角を描画
			const rect = this.calculateRectangle(
				this.globalState.firstClickX, 
				this.globalState.firstClickY, 
				coords.x, 
				coords.y
			);

			// 最小サイズチェック
			if (!this.isValidStampSize(rect.width, rect.height)) {
				this.cancelCurrentStamp();
				return;
			}
            
			// スタンプオーバーレイを最終位置に設定
			this.globalState.currentStampOverlay.style.left = `${rect.left}px`;
			this.globalState.currentStampOverlay.style.top = `${rect.top}px`;
			this.globalState.currentStampOverlay.style.width = `${rect.width}px`;
			this.globalState.currentStampOverlay.style.height = `${rect.height}px`;

			// スタンプテキストを追加
			const stampText = document.createElement('div');
			stampText.className = 'stamp-text';
			stampText.textContent = 'sample';
			this.globalState.currentStampOverlay.appendChild(stampText);
            
			// クリアボタンを有効化
			this.clearStampsButton.disabled = false;
            
			// スタンプモードを自動的に解除
			this.disableStampMode();
            
			// 次のスタンプのため状態をリセット
			this.globalState.currentStampOverlay = null;
		}
	}

	/**
	 * オーバーレイのサイズと位置を更新
	 */
	updateOverlayDimensions(overlay, rect, minSize = 20) {
		if (rect.width < minSize || rect.height < minSize) {
			overlay.style.width = `${Math.max(rect.width, minSize)}px`;
			overlay.style.height = `${Math.max(rect.height, minSize)}px`;
		} else {
			overlay.style.left = `${rect.left}px`;
			overlay.style.top = `${rect.top}px`;
			overlay.style.width = `${rect.width}px`;
			overlay.style.height = `${rect.height}px`;
		}
	}

	handleStampMouseMove(event) {
		if (!this.globalState.isStampMode || !this.globalState.isFirstClickDone || !this.globalState.currentStampOverlay) return;
        
		event.preventDefault();
        
		// スロットリング: 60fps相当の制限
		const now = Date.now();
		if (this.lastMouseMoveTime && (now - this.lastMouseMoveTime) < 16) {
			return;
		}
		this.lastMouseMoveTime = now;
        
		const coords = this.getRelativeCoordinates(event, this.overlayRight);
		const rect = this.calculateRectangle(
			this.globalState.firstClickX, 
			this.globalState.firstClickY, 
			coords.x, 
			coords.y
		);
        
		this.updateOverlayDimensions(this.globalState.currentStampOverlay, rect);
	}

	handleDocumentClick(event) {
		// スタンプモード中で1回目のクリックが完了している場合のみ処理
		if (!this.globalState.isStampMode || !this.globalState.isFirstClickDone) return;
        
		// クリック位置がcanvas内かどうかをチェック
		const coords = this.getRelativeCoordinates(event, this.canvasRight);
		const rect = this.canvasRight.getBoundingClientRect();
        
		// canvas外のクリックの場合
		if (coords.x < 0 || coords.y < 0 || coords.x > rect.width || coords.y > rect.height) {
			// スタンプモードを解除
			this.disableStampMode();
            
			// プレビューをクリア
			this.clearStampPreview();
		}
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * スタンプモードを無効化
	 */
	disableStampMode() {
		this.globalState.isStampMode = false;
		BaseManager.setModeUI({
			button: this.stampModeButton,
			container: this.overlayRight.parentElement,
			containerClass: 'stamp-mode',
			cursorElement: this.canvasRight,
			isActive: false,
			texts: {
				inactive: '📌 Stamp追加'
			}
		});
        
		// 次のスタンプのため状態をリセット
		this.globalState.isFirstClickDone = false;
	}
}

