import { Utils } from '../utils/utils.js';

export class PageIndicatorController {
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.stampManager = options.stampManager;
		this.callbacks = options.callbacks || {};

		this.initializeElements();
	}
    
	// === 1. 初期化・要素取得 ===
	initializeElements() {
		this.pageIndicator = document.getElementById('pageIndicator');
		this.pageIndicatorItems = document.getElementById('pageIndicatorItems');
	}

	// === ヘルパーメソッド ===
    
	/**
	 * 指定ページ番号のインジケーター項目を取得
	 */
	findPageIndicatorItem(pageNum) {
		const items = this.pageIndicatorItems.querySelectorAll('.page-indicator-item');
		for (const item of items) {
			const pageNumberElement = item.querySelector('.page-number');
			if (pageNumberElement && parseInt(pageNumberElement.textContent) === pageNum) {
				return item;
			}
		}
		return null;
	}

	/**
	 * カウント表示テキストから数値を抽出
	 */
	extractCountFromText(text) {
		return parseInt(text.replace(/[()]/g, '')) || 0;
	}

	/**
	 * 要素のカウント数値を取得
	 */
	getElementCountValue(element) {
		return element ? this.extractCountFromText(element.textContent) : 0;
	}

	/**
	 * ページ数値要素から値を取得
	 */
	getPageNumberFromElement(item) {
		const pageNumberElement = item.querySelector('.page-number');
		return pageNumberElement ? parseInt(pageNumberElement.textContent) : 0;
	}

	/**
	 * 進捗更新の遅延実行
	 */
	scheduleProgressUpdate(pageNum = null, delay = 50) {
		setTimeout(() => {
			if (pageNum) {
				this.callbacks.updatePageConfirmationProgress?.(pageNum);
			} else {
				this.callbacks.updateAllPageConfirmationProgress?.();
			}
		}, delay);
	}

	/**
	 * デバッグログ出力
	 */
	logPageCount(pageNum, totalCount, action = 'calculated') {
		// デバッグログは削除済み
	}

	/**
	 * カウント調整ログ出力
	 */
	logCountAdjustment(pageNum, oldCount, newCount, adjustment) {
		// デバッグログは削除済み
	}

	/**
	 * インジケーター項目のOCRカウントを更新
	 */
	updateItemOcrCount(item, count) {
		const ocrCountElement = item.querySelector('.ocr-count');
		if (ocrCountElement) {
			ocrCountElement.textContent = `(${count})`;
		}
	}

	/**
	 * インジケーター項目の現在ページ状態を設定
	 */
	setItemCurrentState(item, isCurrent) {
		if (isCurrent) {
			item.classList.add('current');
		} else {
			item.classList.remove('current');
		}
	}

	/**
	 * 指定ページの日本語OCRボックス数を計算（削除分除外）
	 */
	calculatePageOcrCount(pageNum) {
		let ocrCount = 0;
        
		if (this.globalState.ocrData?.results?.[0]?.pages) {
			const pageData = this.globalState.ocrData.results[0].pages.find(
				page => page.pageNum === pageNum
			);
            
			if (pageData?.ocrResults) {
				ocrCount = pageData.ocrResults.filter(ocrResult => {
					if (!Utils.containsJapanese(ocrResult.text)) return false;
                    
					const bboxId = this.callbacks.generateBboxId(pageNum, ocrResult);
					return !this.callbacks.isBboxDeleted(bboxId);
				}).length;
			}
		}
        
		return ocrCount;
	}

	/**
	 * 指定ページの総BOXカウント（OCR + カスタム）を計算
	 */
	calculatePageTotalCount(pageNum) {
		const ocrCount = this.calculatePageOcrCount(pageNum);
		const customCount = this.callbacks.getCustomBboxCountForPage(pageNum);
		return ocrCount + customCount;
	}

	/**
	 * ページが日本語コンテンツを含むかチェック
	 */
	hasJapaneseContent(pageNum) {
		const ocrCount = this.calculatePageOcrCount(pageNum);
		const customCount = this.callbacks.getCustomBboxCountForPage(pageNum);
		return ocrCount > 0 || customCount > 0;
	}

	/**
	 * インジケーター項目を作成
	 */
	createPageIndicatorItem(pageNum) {
		const item = document.createElement('div');
		item.className = 'page-indicator-item';
		item.addEventListener('click', () => this.goToPage(pageNum));

		// ページ番号
		const pageNumber = document.createElement('span');
		pageNumber.className = 'page-number';
		pageNumber.textContent = pageNum;
		item.appendChild(pageNumber);

		// OCRカウント
		const ocrCount = document.createElement('span');
		ocrCount.className = 'ocr-count';
		const count = this.calculatePageTotalCount(pageNum);
		ocrCount.textContent = `(${count})`;
		item.appendChild(ocrCount);

		// 進捗率バー
		const progressBar = document.createElement('div');
		progressBar.className = 'progress-bar';
		const progressFill = document.createElement('div');
		progressFill.className = 'progress-fill';
		progressFill.style.width = '0%';
		progressBar.appendChild(progressFill);
		item.appendChild(progressBar);

		// 進捗率テキスト
		const progressText = document.createElement('div');
		progressText.className = 'progress-text';
		progressText.textContent = '0/0';
		item.appendChild(progressText);

		// 日本語コンテンツの有無
		if (this.hasJapaneseContent(pageNum)) {
			item.classList.add('has-japanese');
		}

		// 現在ページの設定
		this.setItemCurrentState(item, pageNum === this.globalState.currentPage);

		return item;
	}

	// === 2. インジケーター全体の生成・更新 ===
	updatePageIndicator() {
		// PDFが読み込まれていない場合は非表示
		if (!this.globalState.pdfDoc || this.globalState.totalPages === 0) {
			this.pageIndicator.style.display = 'none';
			return;
		}

		// インジケーター項目を作成（全ページ分）
		this.pageIndicatorItems.innerHTML = '';
        
		for (let pageNum = 1; pageNum <= this.globalState.totalPages; pageNum++) {
			const item = this.createPageIndicatorItem(pageNum);
			this.pageIndicatorItems.appendChild(item);
            
			// デバッグ用ログ
			const totalCount = this.calculatePageTotalCount(pageNum);
			this.logPageCount(pageNum, totalCount, 'created');
		}
        
		this.pageIndicator.style.display = 'flex';
        
		// 進捗率バーを初期化
		this.scheduleProgressUpdate(null, 100);
	}

	// === 3. インジケーター個別項目の更新 ===
	updatePageIndicatorCurrent() {
		const items = this.pageIndicatorItems.querySelectorAll('.page-indicator-item');
		items.forEach(item => {
			const pageNum = this.getPageNumberFromElement(item);
			if (pageNum > 0) {
				this.setItemCurrentState(item, pageNum === this.globalState.currentPage);
			}
		});
	}

	updatePageIndicatorCount(pageNum, newCount) {
		const item = this.findPageIndicatorItem(pageNum);
		if (item) {
			this.updateItemOcrCount(item, newCount);
		}
	}

	// === 4. カウント関連の計算・調整 ===
	adjustPageIndicatorCount(pageNum, adjustment) {
		const item = this.findPageIndicatorItem(pageNum);
		if (!item) return;

		const ocrCountElement = item.querySelector('.ocr-count');
		if (ocrCountElement) {
			const currentCount = this.getElementCountValue(ocrCountElement);
			const newCount = Math.max(0, currentCount + adjustment);
			this.updateItemOcrCount(item, newCount);
            
			this.logCountAdjustment(pageNum, currentCount, newCount, adjustment);
		}
	}

	recalculateCurrentPageIndicatorCount() {
		if (!this.globalState.currentPage) return;
        
		const totalCount = this.calculatePageTotalCount(this.globalState.currentPage);
        
		// インジケータの表示を更新
		this.updatePageIndicatorCount(this.globalState.currentPage, totalCount);
        
		// 進捗率バーも更新
		this.scheduleProgressUpdate(this.globalState.currentPage);
        
		this.logPageCount(this.globalState.currentPage, totalCount, 'recalculated');
	}

	getCurrentPageIndicatorCount(pageNum) {
		const item = this.findPageIndicatorItem(pageNum);
		if (!item) return 0;

		const ocrCountElement = item.querySelector('.ocr-count');
		return this.getElementCountValue(ocrCountElement);
	}

	// === 5. ページ遷移・ナビゲーション ===
	goToPage(pageNumber) {
		// PageManagerの機能をコールバック経由で利用
		if (this.callbacks.navigateToPage) {
			return this.callbacks.navigateToPage(pageNumber);
		}
		// コールバック未設定時は何もしない
		return false;
	}

	// === 6. 進捗バー管理 ===
    
	_createProgressBarElements(pageItem) {
		const progressBar = document.createElement('div');
		progressBar.className = 'progress-bar';
        
		const progressFill = document.createElement('div');
		progressFill.className = 'progress-fill';
		progressBar.appendChild(progressFill);
        
		const progressText = document.createElement('div');
		progressText.className = 'progress-text';
        
		// OCRカウントの後に進捗バーと進捗テキストを追加
		const ocrCount = pageItem.querySelector('.ocr-count');
		if (ocrCount) {
			pageItem.insertBefore(progressBar, ocrCount.nextSibling);
			pageItem.insertBefore(progressText, progressBar.nextSibling);
		} else {
			pageItem.appendChild(progressBar);
			pageItem.appendChild(progressText);
		}
        
		return { progressBar, progressFill, progressText };
	}

	_updateProgressBarColor(progressFill, percentage) {
		if (percentage === 100) {
			progressFill.style.backgroundColor = '#28a745'; // 緑
		} else {
			progressFill.style.backgroundColor = '#ffc107'; // 黄
		}
	}

	updateProgressBar(pageNum, percentage, confirmedCount, totalCount) {
		const pageItem = this.pageIndicatorItems.querySelector(
			`.page-indicator-item:nth-child(${pageNum})`
		);
        
		if (!pageItem) return;
        
		// 進捗率バーの要素を取得または作成
		let progressBar = pageItem.querySelector('.progress-bar');
		let progressFill = pageItem.querySelector('.progress-fill');
		let progressText = pageItem.querySelector('.progress-text');
        
		if (!progressBar) {
			const elements = this._createProgressBarElements(pageItem);
			progressBar = elements.progressBar;
			progressFill = elements.progressFill;
			progressText = elements.progressText;
		}
        
		// 進捗率バーを更新
		progressFill.style.width = `${percentage}%`;
		progressText.textContent = `${confirmedCount}/${totalCount}`;
        
		// 色を進捗率に応じて変更
		this._updateProgressBarColor(progressFill, percentage);
	}
    
	// === 7. 進捗率計算・更新 ===
    
	updatePageConfirmationProgress(pageNum) {
		// ページ内の全bboxを取得
		const pageBboxes = this.callbacks.getPageBboxes(pageNum);
        
		if (pageBboxes.length === 0) {
			// bboxがない場合は進捗率0%
			this.updateProgressBar(pageNum, 0, 0, 0);
			return;
		}
        
		// 確認済みのbbox数をカウント
		const confirmedCount = pageBboxes.filter(bboxId => 
			this.callbacks.getBboxConfirmationStatus(bboxId)
		).length;
        
		const totalCount = pageBboxes.length;
		const percentage = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0;
        
		// 進捗率バーを更新
		this.updateProgressBar(pageNum, percentage, confirmedCount, totalCount);
	}

	updateAllPageConfirmationProgress() {
		for (let pageNum = 1; pageNum <= this.globalState.totalPages; pageNum++) {
			this.updatePageConfirmationProgress(pageNum);
		}
	}

	// ページインジケーターを元の状態に戻す
	resetPageIndicatorToOriginal(pageNum) {
		// 元のOCR結果から日本語bboxの数を再計算
		const originalJapaneseBboxCount = this.callbacks.countOriginalJapaneseBboxes(pageNum);
        
		// ページインジケーターを更新
		const pageItem = document.querySelector(`.page-indicator-item[data-page="${pageNum}"]`);
		if (pageItem) {
			const ocrCountElement = pageItem.querySelector('.ocr-count');
			if (ocrCountElement) {
				ocrCountElement.textContent = `(${originalJapaneseBboxCount})`;
			}
		}
	}
}

