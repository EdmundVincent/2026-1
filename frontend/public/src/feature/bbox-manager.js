import { Utils } from '../utils/utils.js';

/**
 * BboxManager - バウンディングボックス管理クラス
 * 
 * OCR結果から生成されるバウンディングボックス（bbox）の状態管理、
 * 選択・削除・復元・翻訳管理などの機能を提供する。
 * 
 * 主要機能:
 * - bboxの基本CRUD操作
 * - 選択状態の管理
 * - 削除/復元機能
 * - 翻訳関連データの管理
 * - 確認ステータスの管理
 */
export class BboxManager{
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.ragTranslation = options.ragTranslation;
		this.callbacks = options.callbacks || {};

		this.initElements();
		this.initEvents();  
	}

	/**
	 * DOM要素の初期化
	 */
	initElements() {
		// 確認ステータス要素
		this.confirmationStatusText = document.getElementById('confirmationStatusText');
		this.toggleConfirmationButton = document.getElementById('toggleConfirmationButton');

		this.overlayLeft = document.getElementById('overlayLeft');
		this.overlayRight = document.getElementById('overlayRight');

		this.toggleDeleteTranslationButton = document.getElementById('toggleDeleteTranslationButton');

		// 範囲選択要素
		this.toggleAddTranslationButton = document.getElementById('toggleAddTranslationButton');
		this.resetToDefaultButton = document.getElementById('resetToDefaultButton');
		this.addTranslationButton = document.getElementById('addTranslationButton');
		this.joinTranslationButton = document.getElementById('joinTranslationButton');
		this.cancelSelectionButton = document.getElementById('cancelSelectionButton');
		this.selectionStatus = document.getElementById('selectionStatus');

		this.canvasLeft = document.getElementById('pdfCanvasLeft');
		this.canvasRight = document.getElementById('pdfCanvasRight');
		this.canvasContainerLeft = this.canvasLeft.closest('.canvas-container');
		this.canvasContainerRight = this.canvasRight.closest('.canvas-container');

		this.selectedCount = document.getElementById('selectedCount');
		// 初期状態は削除モードに応じて制御される

		this.pageIndicatorItems = document.getElementById('pageIndicatorItems');
	}

	/**
	 * イベントリスナーの初期化
	 */
	initEvents() {
		// 一括選択削除機能の初期化
		this.toggleDeleteTranslationButton = document.getElementById('toggleDeleteTranslationButton');
		this.deleteAllBboxes = document.getElementById('deleteAllBboxes');
		this.deleteSelectedBboxes = document.getElementById('deleteSelectedBboxes');
		this.clearBatchSelection = document.getElementById('clearBatchSelection');
	}

	// === 汎用Getter/Setterパターン ===
	_getMapValue(mapName, bboxId, defaultValue = null) {
		return this.globalState[mapName].get(bboxId) || defaultValue;
	}

	_setMapValue(mapName, bboxId, value) {
		this.globalState[mapName].set(bboxId, value);
	}

	_hasInSet(setName, bboxId) {
		return this.globalState[setName].has(bboxId);
	}

	_addToSet(setName, bboxId) {
		this.globalState[setName].add(bboxId);
	}

	_removeFromSet(setName, bboxId) {
		this.globalState[setName].delete(bboxId);
	}

	// === BBoxデータ管理（単一定義） ===
	getBboxData(bboxId) {
		return this._getMapValue('bboxData', bboxId);
	}

	setBboxData(bboxId, data) {
		this._setMapValue('bboxData', bboxId, data);
	}

	getBboxDatas(bboxIds) {
		return Array.from(bboxIds).map(id => this.getBboxData(id)).filter(data => data);
	}

	// === 削除管理 ===
	isBboxDeleted(bboxId) {
		return this._hasInSet('deletedBboxes', bboxId);
	}

	deleteBbox(bboxId) {
		this._addToSet('deletedBboxes', bboxId);
		// RAGキャッシュもクリア
		this.ragTranslation.clearBboxRAGCache(bboxId);
		// 幅調整データもクリア
		if (this.globalState.bboxWidths.has(bboxId)) {
			this.globalState.bboxWidths.delete(bboxId);
		}
	}

	restoreBbox(bboxId) {
		this._removeFromSet('deletedBboxes', bboxId);
	}

	// === 翻訳管理 ===
	getBboxEditedTranslation(bboxId) {
		return this._getMapValue('bboxEditedTranslations', bboxId);
	}

	setBboxEditedTranslation(bboxId, translation) {
		this._setMapValue('bboxEditedTranslations', bboxId, translation);
	}

	// === テキスト設定 ===
	getBboxWrapSetting(bboxId) {
		return this._getMapValue('bboxWrapSettings', bboxId, false);
	}

	setBboxWrapSetting(bboxId, isWrapEnabled) {
		this._setMapValue('bboxWrapSettings', bboxId, isWrapEnabled);
	}

	// === フォントサイズ調整 ===
	getBboxFontSize(bboxId) {
		return this._getMapValue('bboxFontSizes', bboxId, 12);
	}

	setBboxFontSize(bboxId, fontSize) {
		this._setMapValue('bboxFontSizes', bboxId, fontSize);
	}

	// === 翻訳確認ステータス管理 ===
	getBboxConfirmationStatus(bboxId) {
		return this._getMapValue('bboxConfirmationStatus', bboxId, false);
	}

	setBboxConfirmationStatus(bboxId, isConfirmed) {
		this._setMapValue('bboxConfirmationStatus', bboxId, isConfirmed);
	}

	// === BBoxデータ更新 ===
	updateBboxData(bboxId, newData) {
		const bbox = this.getBboxData(bboxId);
		if (!bbox) return;
        
		// ページ番号が変更された場合、古いページのカスタムbboxリストから削除
		if (bbox.pageNum !== newData.pageNum) {
			this.globalState.customBboxIds[bbox.pageNum] = this.globalState.customBboxIds[bbox.pageNum].filter(id => id !== bboxId);
		}
        
		// データをマージ（上書き）
		Object.assign(bbox, newData);
        
		// 新しいページ番号のカスタムbboxリストに追加
		if (!this.globalState.customBboxIds[newData.pageNum]) {
			this.globalState.customBboxIds[newData.pageNum] = [];
		}
		this.globalState.customBboxIds[newData.pageNum].push(bboxId);
	}

	// === 共通削除処理 ===
	_processPageIndicatorForDeletion(bboxData) {
		if (!bboxData) return false;
		// 日本語を含むOCR由来のbboxまたはカスタムbboxの場合、インジケーターから減算
		return (Utils.containsJapanese(bboxData.text) && !bboxData.isCustom) || bboxData.isCustom;
	}

	_updatePageProgressAfterChange(pageNum, delay = 100) {
		setTimeout(() => {
			this.callbacks.updatePageConfirmationProgress(pageNum);
		}, delay);
	}

	// === 3. BBox選択・操作 ===
	// === 選択状態の共通処理 ===
	_toggleElementSelection(element, isSelected, className) {
		if (isSelected) {
			element.classList.add(className);
		} else {
			element.classList.remove(className);
		}
	}

	_updateSelectionSet(bboxId, shouldSelect) {
		if (shouldSelect) {
			this.globalState.selectedBboxIds.add(bboxId);
		} else {
			this.globalState.selectedBboxIds.delete(bboxId);
		}
	}

	toggleBboxSelection(bboxId) {
		const bboxElement = this.overlayLeft.querySelector(`[data-bbox-id="${bboxId}"]`);
		if (!bboxElement) return;
        
		const isCurrentlySelected = this.globalState.selectedBboxIds.has(bboxId);
		const shouldSelect = !isCurrentlySelected;
        
		// 選択状態を更新
		this._updateSelectionSet(bboxId, shouldSelect);
		this._toggleElementSelection(bboxElement, shouldSelect, 'selection-selected');
        
		// 選択状態を更新
		this.callbacks.updateSelectionStatus();
	}

	clearAllSelectedBbox() {
		// 全てのbboxから選択状態のクラスを削除
		const allBoxes = this.overlayLeft.querySelectorAll('.ocr-box');
		allBoxes.forEach(box => box.classList.remove('selection-selected'));
	}

	onLeftBboxClicked(bboxId) {
		// 選択モードの場合
		if (this.globalState.isAddTranslationMode) {
			this.toggleBboxSelection(bboxId);
			return;
		}
        
		// 通常モード：削除されたbboxの場合は復活させる
		if (this.isBboxDeleted(bboxId)) {
			const bboxData = this.getBboxData(bboxId);
            
			this.restoreBbox(bboxId);
            
			// インジケーターを即時更新（復活のため+1）
			if (bboxData && this._processPageIndicatorForDeletion(bboxData)) {
				this.callbacks.adjustPageIndicatorCount(bboxData.pageNum, 1);
			}
            
			// 右側プレビューを更新して復活したbboxを表示
			this.callbacks.updateRightPreview();
            
			// 進捗率バーも更新
			if (bboxData) {
				this._updatePageProgressAfterChange(bboxData.pageNum);
			}
		}
        
		// 翻訳パネルにロード
		this.callbacks.loadOCRBoxIntoPanel(bboxId);
	}

	// === 4. BBox描画・UI連携 ===
	generateBboxId(pageNum, ocrResult) {
		// ページ番号とbbox座標を組み合わせたユニークIDを生成
		const bboxKey = `${pageNum}_${ocrResult.bbox.left}_${ocrResult.bbox.top}_${ocrResult.bbox.right}_${ocrResult.bbox.bottom}`;
		return bboxKey;
	}

	getPageBboxes(pageNum) {
		const pageBboxes = [];
        
		// OCR由来のbbox
		this._addOCRBboxesForPage(pageNum, pageBboxes);
        
		// カスタムbbox
		this._addCustomBboxesForPage(pageNum, pageBboxes);
        
		return pageBboxes;
	}

	_addOCRBboxesForPage(pageNum, pageBboxes) {
		if (this.globalState.ocrData && this.globalState.ocrData.results && this.globalState.ocrData.results.length > 0) {
			const result = this.globalState.ocrData.results[0];
			if (result.pages) {
				const pageData = result.pages.find(page => page.pageNum === pageNum);
				if (pageData && pageData.ocrResults) {
					pageData.ocrResults.forEach(ocrResult => {
						const bboxId = this.generateBboxId(pageNum, ocrResult);
						// 削除されていない日本語を含むbboxのみ対象
						if (!this.isBboxDeleted(bboxId) && Utils.containsJapanese(ocrResult.text)) {
							pageBboxes.push(bboxId);
						}
					});
				}
			}
		}
	}

	_addCustomBboxesForPage(pageNum, pageBboxes) {
		this.globalState.bboxData.forEach((data, bboxId) => {
			if (data.pageNum === pageNum && data.isCustom && !this.isBboxDeleted(bboxId)) {
				pageBboxes.push(bboxId);
			}
		});
	}

	updateSelectedOCRBoxVisual() {
		// 既存の選択状態をクリア（左右両方）
		const allOCRBoxesLeft = this.overlayLeft.querySelectorAll('.ocr-box');
		const allOCRBoxesRight = this.overlayRight.querySelectorAll('.ocr-box');
		allOCRBoxesLeft.forEach(box => box.classList.remove('selected'));
		allOCRBoxesRight.forEach(box => box.classList.remove('selected'));
        
		if (!this.globalState.selectedOCRBox) return;
        
		// 現在選択されているOCRボックスを探して選択状態にする（右側のみ）
		const selectedBboxId = this.globalState.selectedOCRBox.bboxId;
		allOCRBoxesRight.forEach(box => {
			if (box.dataset.bboxId === selectedBboxId) {
				box.classList.add('selected');
			}
		});
	}

	// === 5. カスタムBBox管理 ===
	getCustomBboxCountForPage(pageNum) {
		let customCount = 0;
		for (const [bboxId, bboxData] of this.globalState.bboxData.entries()) {
			if (bboxData.isCustom && bboxData.pageNum === pageNum && !this.isBboxDeleted(bboxId)) {
				customCount++;
			}
		}
		return customCount;
	}

	// 削除ボタンクリック時の処理
	onDeleteBboxButtonClicked() {
		if (!this.globalState.selectedOCRBox) return;

		const bboxId = this.globalState.selectedOCRBox.bboxId;
		const bboxData = this.getBboxData(bboxId);
        
		// 削除前にインジケーターから減算するかどうかを判断
		const shouldDecrementIndicator = this._processPageIndicatorForDeletion(bboxData);

		// アラートなしで直接削除を実行
		this.deleteBbox(bboxId);

		// インジケーターを即時更新（削除のため-1）
		if (shouldDecrementIndicator && bboxData) {
			this.callbacks.adjustPageIndicatorCount(bboxData.pageNum, -1);
		}

		// 右側プレビューを更新（削除されたbboxは表示されない）
		this.callbacks.updateRightPreview();

		// 進捗率バーも更新
		if (shouldDecrementIndicator && bboxData) {
			this._updatePageProgressAfterChange(bboxData.pageNum);
		}

		// 選択状態をクリア
		this.globalState.selectedOCRBox = null;
        
		// 翻訳パネルは閉じないが、内容を初期化
		this.callbacks.initializePanelContent();
	}

	// 元のOCR結果から日本語bboxの数をカウント
	countOriginalJapaneseBboxes(pageNum) {
		if (!this.globalState.ocrData || !this.globalState.ocrData.results || this.globalState.ocrData.results.length === 0) {
			return 0;
		}

		// OCRデータから現在のページを検索
		const result = this.globalState.ocrData.results[0];
		const currentPageData = result.pages?.find(page => page.pageNum === pageNum);
        
		if (!currentPageData || !currentPageData.ocrResults) {
			return 0;
		}

		// 日本語を含むOCR結果をカウント
		let count = 0;
		currentPageData.ocrResults.forEach(ocrResult => {
			if (Utils.containsJapanese(ocrResult.text)) {
				count++;
			}
		});
        
		return count;
	}

	// ===== カスタムbbox作成・管理 =====
    
	/**
	 * 選択されたbboxから新しいカスタムbboxを作成（データ管理のみ）
	 */
	createCustomBboxData(selectedBboxIds) {
		// 選択されたbboxの情報を取得
		const selectedBboxes = Array.from(selectedBboxIds)
			.map(id => this.getBboxData(id))
			.filter(data => data);
        
		if (selectedBboxes.length === 0) {
			throw new Error('有効な選択範囲がありません');
		}
        
		// 現在のページ番号を取得
		const pageNum = selectedBboxes[0].pageNum;
        
		// 選択されたbboxを囲む矩形を計算
		const combinedBbox = this._calculateCombinedBboxForCustom(selectedBboxes);
        
		// 選択されたテキストを結合
		const combinedText = selectedBboxes.map(data => data.text).join(' ');
        
		// 新しいカスタムbboxIDを生成
		this.globalState.customBboxCounter++;
		const customBboxId = `custom_${pageNum}_${this.globalState.customBboxCounter}`;
        
		// 新しいbboxデータを作成
		const customBboxData = {
			pageNum: pageNum,
			text: combinedText,
			bbox: combinedBbox,
			ocrResult: {
				text: combinedText,
				bbox: combinedBbox
			},
			isCustom: true,
			sourceBboxIds: Array.from(selectedBboxIds)
		};
        
		// bboxデータを保存
		this.setBboxData(customBboxId, customBboxData);
        
		// 削除される日本語bboxの数をカウント
		let deletedJapaneseBboxCount = 0;
		selectedBboxIds.forEach(bboxId => {
			const bboxData = this.getBboxData(bboxId);
			// 日本語を含むOCR由来のbboxのみカウント（カスタムbboxは除く）
			if (bboxData && Utils.containsJapanese(bboxData.text) && !bboxData.isCustom) {
				deletedJapaneseBboxCount++;
			}
			this.deleteBbox(bboxId);
		});
        
		return {
			customBboxId,
			customBboxData,
			removedBboxIds: Array.from(selectedBboxIds),
			deletedJapaneseBboxCount
		};
	}

	/**
	 * カスタムbbox作成用の矩形計算（既存のcalculateCombinedBboxと区別）
	 */
	_calculateCombinedBboxForCustom(bboxDataArray) {
		if (bboxDataArray.length === 0) return null;
        
		let minLeft = Infinity;
		let minTop = Infinity;
		let maxRight = -Infinity;
		let maxBottom = -Infinity;
        
		bboxDataArray.forEach(data => {
			const bbox = data.bbox;
			minLeft = Math.min(minLeft, bbox.left);
			minTop = Math.min(minTop, bbox.top);
			maxRight = Math.max(maxRight, bbox.right);
			maxBottom = Math.max(maxBottom, bbox.bottom);
		});
        
		return {
			left: minLeft,
			top: minTop,
			right: maxRight,
			bottom: maxBottom
		};
	}
}

