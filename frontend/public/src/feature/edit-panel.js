import { BaseManager } from '../utils/base-manager.js';

export class EditPanel{
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.callbacks = options.callbacks || {};
		this.initElements();
		this.initEvents();
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * スタンプモードのUI状態を更新
	 */
	updateStampModeUI(isStampMode) {
		BaseManager.setModeUI({
			button: this.stampModeButton,
			container: this.overlayRight.parentElement,
			containerClass: 'stamp-mode',
			cursorElement: this.canvasRight,
			cursor: 'crosshair',
			isActive: isStampMode,
			texts: {
				active: '📌 Stamp中',
				inactive: '📌 Stamp追加'
			}
		});
	}

	/**
	 * スタンプモード無効化時のクリーンアップ
	 */
	cleanupStampMode() {
		// プレビューをクリア
		this.callbacks.clearStampPreview();
        
		// 1回目のクリックが完了している場合はリセット
		if (this.globalState.isFirstClickDone) {
			this.callbacks.cancelCurrentStamp();
		}
	}

	/**
	 * クリアボタンの状態を更新
	 */
	updateClearStampsButtonState() {
		const currentPageStamps = this.globalState.canvasStamps.filter(
			stamp => stamp.pageNum === this.globalState.currentPage
		);
		this.clearStampsButton.disabled = currentPageStamps.length === 0;
	}

	// === 初期化メソッド ===

	initElements() {
		this.stampModeButton = document.getElementById('stampModeButton');
		this.canvasRight = document.getElementById('pdfCanvasRight');
		this.overlayRight = document.getElementById('overlayRight');
		this.clearStampsButton = document.getElementById('clearStampsButton');
	}

	initEvents() {
		this.stampModeButton.addEventListener('click', () => this.toggleStampMode());
	}

	// === 描画オプションパネル操作 ===
    
	toggleStampMode() {
		this.globalState.isStampMode = !this.globalState.isStampMode;
        
		this.updateStampModeUI(this.globalState.isStampMode);
        
		if (!this.globalState.isStampMode) {
			this.cleanupStampMode();
		}
        
		this.updateClearStampsButtonState();
	}
}

