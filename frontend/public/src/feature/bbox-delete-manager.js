import { Utils } from '../utils/utils.js';
import { BaseManager } from '../utils/base-manager.js';

export class BboxDeleteManager {
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.pageIndicatorController = options.pageIndicatorController; // ページインジケーターのコントローラー
		this.bboxManager = options.bboxManager; // BboxManagerのインスタンスを受け取る
		// this.pdfRender = options.pdfRender;
		this.callbacks = options.callbacks || {};

		this.initializeElements();
		this.initializeEvents();
	}

	// ===== 1. 初期化・要素取得・イベント登録 =====

	initializeElements() {
		this.toggleDeleteTranslationButton = document.getElementById('toggleDeleteTranslationButton');
		this.deleteAllBboxes = document.getElementById('deleteAllBboxes');
		this.deleteSelectedBboxes = document.getElementById('deleteSelectedBboxes');
		this.clearBatchSelection = document.getElementById('clearBatchSelection');

		this.overlayRight = document.getElementById('overlayRight');

		this.selectedCount = document.getElementById('selectedCount');
	}

	initializeEvents() {
		this.toggleDeleteTranslationButton.addEventListener('click', () => this.toggleDeleteTranslationMode());
		this.deleteAllBboxes.addEventListener('click', () => this.deleteAllBboxesHandler());
		this.deleteSelectedBboxes.addEventListener('click', () => this.deleteSelectedBboxesHandler());
		this.clearBatchSelection.addEventListener('click', () => this.clearBatchSelectionHandler());
	}

	// ===== 2. 削除モード管理 =====

	// === 一括選択 ===
	toggleDeleteTranslationMode() {
		this.globalState.isDeleteTranslationMode = !this.globalState.isDeleteTranslationMode;
        
		if (this.globalState.isDeleteTranslationMode) {
			this.setDeleteModeUI(true);
			this.enableDeleteTranslationMode();
		} else {
			this.setDeleteModeUI(false);
            
			// 削除モードを無効化する際に、選択されているbboxをクリア
			this.clearBatchSelectionHandler();
            
			this.disableDeleteTranslationMode();
		}
	}

	enableDeleteTranslationMode() {
		// 右プレビューの全bboxに一括選択用のイベントリスナーを追加
		const rightOcrBoxes = this.overlayRight.querySelectorAll('.ocr-box');
		rightOcrBoxes.forEach(box => {
			box.classList.add('batch-selectable');
			box.addEventListener('click', this.handleBatchBboxClick.bind(this));
            
			// 既に選択されているbboxには選択状態を復元
			const bboxId = box.dataset.bboxId;
			if (this.globalState.selectedBboxIds.has(bboxId)) {
				box.classList.add('batch-selected');
			}
		});
        
		// 範囲選択機能を有効化
		this.callbacks.enableAreaSelection();
        
		this.updateDeleteTranslationModeUI();
	}

	disableDeleteTranslationMode() {
		// 右プレビューの全bboxから一括選択用のクラスとイベントを削除
		// ただし、選択状態（batch-selected）は保持する
		const rightOcrBoxes = this.overlayRight.querySelectorAll('.ocr-box');
		rightOcrBoxes.forEach(box => {
			box.classList.remove('batch-selectable');
			box.removeEventListener('click', this.handleBatchBboxClick.bind(this));
			// batch-selectedクラスは削除しない（青い枠線を残すため）
		});
        
		// 範囲選択機能を無効化
		this.callbacks.disableAreaSelection();
        
		// 削除モードが無効な時は全削除ボタンも無効にする
		this.deleteAllBboxes.disabled = true;
        
		this.updateDeleteTranslationModeUI();
	}

	// ===== 3. 削除操作処理 =====

	deleteAllBboxesHandler() {
		// 右プレビューの削除されていない全bboxを取得
		const allBboxes = this.overlayRight.querySelectorAll('.ocr-box:not(.deleted)');
		if (allBboxes.length === 0) return;
        
		// 確認ダイアログ
		if (!this.confirmDeletion(`右側プレビューの全てのbbox（${allBboxes.length}個）を削除しますか？`)) {
			return;
		}
        
		// 全bboxのIDを取得
		const bboxIds = Array.from(allBboxes).map(element => element.dataset.bboxId);
        
		// 削除実行
		this.executeBboxDeletion(bboxIds, 'All deleted');
	}

	deleteSelectedBboxesHandler() {
		if (this.globalState.selectedBboxIds.size === 0) return;
        
		const selectedCount = this.globalState.selectedBboxIds.size;
        
		// 確認ダイアログ
		if (!this.confirmDeletion(`選択した${selectedCount}個のbboxを削除しますか？`)) {
			return;
		}
        
		// 削除実行
		const bboxIds = Array.from(this.globalState.selectedBboxIds);
		this.executeBboxDeletion(bboxIds, 'Batch deleted');
	}

	// ===== 4. 選択状態管理・UI更新 =====

	handleBatchBboxClick(event) {
		if (!this.globalState.isDeleteTranslationMode) return;
        
		event.stopPropagation();
		const bboxElement = event.currentTarget;
		const bboxId = bboxElement.dataset.bboxId;
        
		if (this.globalState.selectedBboxIds.has(bboxId)) {
			// 選択解除
			this.globalState.selectedBboxIds.delete(bboxId);
			bboxElement.classList.remove('batch-selected');
		} else {
			// 選択追加
			this.globalState.selectedBboxIds.add(bboxId);
			bboxElement.classList.add('batch-selected');
		}
        
		this.updateDeleteTranslationModeUI();
	}

	clearBatchSelectionHandler() {
		// 選択状態をクリア
		this.globalState.selectedBboxIds.clear();
        
		// 視覚的な選択状態を削除
		const rightOcrBoxes = this.overlayRight.querySelectorAll('.ocr-box');
		rightOcrBoxes.forEach(box => {
			box.classList.remove('batch-selected');
		});
        
		this.updateDeleteTranslationModeUI();
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * 削除確認ダイアログ
	 */
	confirmDeletion(message) {
		return confirm(message);
	}

	/**
	 * bbox削除の実行処理（共通ロジック）
	 */
	executeBboxDeletion(bboxIds, logPrefix = 'Deleted') {
		// ページごとの削除数をカウント
		const pageDecrements = new Map();
        
		// 各bboxを削除
		for (const bboxId of bboxIds) {
			const bboxData = this.bboxManager.getBboxData(bboxId);
            
			// 削除前にインジケーターから減算するかどうかを判断
			if (bboxData && this.shouldDecrementIndicator(bboxData)) {
				const pageNum = bboxData.pageNum;
				pageDecrements.set(pageNum, (pageDecrements.get(pageNum) || 0) + 1);
			}
            
			this.bboxManager.deleteBbox(bboxId);
		}
        
		// 削除後の処理
		this.handlePostDeletion(pageDecrements, logPrefix);
	}

	/**
	 * インジケーターから減算すべきかどうかを判断
	 */
	shouldDecrementIndicator(bboxData) {
		// 日本語を含むOCR由来のbboxまたはカスタムbboxの場合、インジケーターから減算
		return (Utils.containsJapanese(bboxData.text) && !bboxData.isCustom) || bboxData.isCustom;
	}

	/**
	 * 削除後の共通処理
	 */
	handlePostDeletion(pageDecrements, logPrefix) {
		// ページごとにインジケーターを更新
		for (const [pageNum, decrementCount] of pageDecrements) {
			this.pageIndicatorController.adjustPageIndicatorCount(pageNum, -decrementCount);
		}
        
		// 選択状態をクリア
		this.globalState.selectedBboxIds.clear();
        
		// UIを更新
		this.callbacks.updateRightPreview();
		this.updateDeleteTranslationModeUI();
        
		// 進捗率バーも更新
		this.updateProgressBarsAfterDeletion(pageDecrements);
        
		// バッチ選択モードを終了
		this.exitDeleteModeIfActive();
	}

	/**
	 * 削除後の進捗バー更新
	 */
	updateProgressBarsAfterDeletion(pageDecrements) {
		setTimeout(() => {
			for (const [pageNum] of pageDecrements) {
				this.callbacks.updatePageConfirmationProgress(pageNum);
			}
		}, 100);
	}

	/**
	 * 削除モードが有効な場合は終了
	 */
	exitDeleteModeIfActive() {
		if (this.globalState.isDeleteTranslationMode) {
			this.toggleDeleteTranslationMode();
		}
	}

	/**
	 * 削除モードのUI状態を設定
	 */
	setDeleteModeUI(isActive) {
		BaseManager.setModeUI({
			button: this.toggleDeleteTranslationButton,
			isActive: isActive,
			texts: {
				active: '選択中',
				inactive: '削除モード'
			}
		});
	}

	updateDeleteTranslationModeUI() {
		const selectedCount = this.globalState.selectedBboxIds.size;
        
		// 削除モードが有効な時のみ選択カウントを表示
		if (this.globalState.isDeleteTranslationMode) {
			this.selectedCount.textContent = `選択: ${selectedCount}個`;
			this.selectedCount.style.display = 'inline';
		} else {
			this.selectedCount.style.display = 'none';
		}
        
		// 右プレビューの全bbox数をカウント（削除済みを除く）
		const allBboxCount = this.overlayRight.querySelectorAll('.ocr-box:not(.deleted)').length;
        
		this.deleteSelectedBboxes.disabled = selectedCount === 0;
		this.clearBatchSelection.disabled = selectedCount === 0;
		this.deleteAllBboxes.disabled = !this.globalState.isDeleteTranslationMode || allBboxCount === 0;
	}

}
