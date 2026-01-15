import { Utils } from '../utils/utils.js';

export class PageManager {
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.stampManager = options.stampManager;
		this.callbacks = options.callbacks || {};

		this.init();
		this.initializeElements();
		this.initializeEvents();
	}
	init() {
		// 初期化処理
	}

	initializeElements() {
		this.prevPageBtn = document.getElementById('prevPage');
		this.nextPageBtn = document.getElementById('nextPage');

	}

	initializeEvents() {
		this.prevPageBtn.addEventListener('click', () => this.goToPrevPage());
		this.nextPageBtn.addEventListener('click', () => this.goToNextPage());
	}

	/**
	 * ページ変更の境界チェック
	 */
	canNavigateToPage(targetPage) {
		return targetPage >= 1 && targetPage <= this.globalState.totalPages;
	}

	/**
	 * ページ変更後の共通処理
	 */
	executePageChangeCallbacks() {
		this.callbacks.clearPanelSelection();
		this.callbacks.renderPage(this.globalState.currentPage);
        
		// ページ描画完了後にスタンプ状態を更新
		if (this.stampManager.updateStampsOnPageChange) {
			this.stampManager.updateStampsOnPageChange(this.globalState.currentPage);
		}
        
		this.callbacks.updateControls();
        
		// ページインジケーター更新
		if (this.callbacks.updatePageIndicator) {
			this.callbacks.updatePageIndicator();
		}
	}

	/**
	 * 指定されたページに移動
	 */
	navigateToPage(targetPage) {
		if (!this.canNavigateToPage(targetPage)) {
			return false;
		}
        
		this.globalState.currentPage = targetPage;
		this.executePageChangeCallbacks();
		return true;
	}

	goToPrevPage() {
		this.navigateToPage(this.globalState.currentPage - 1);
	}
    
	goToNextPage() {
		this.navigateToPage(this.globalState.currentPage + 1);
	}
}

