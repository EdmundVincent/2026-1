import { Utils } from '../utils/utils.js';

/**
 * PDFRender - PDF描画・表示管理クラス
 * 
 * PDFページの描画、OCRバウンディングボックスの表示、
 * 翻訳結果の重ね合わせ表示などを管理する。
 * 
 * 主要機能:
 * - 左右ペインでのPDF同期描画
 * - OCRバウンディングボックスの視覚化
 * - 翻訳テキストのオーバーレイ表示
 * - ズーム・スクロール同期
 * - 範囲選択・クリック検出
 */
export class PDFRender {
	constructor(options = {}) {
		this.globalState = options.globalState; 
		this.zoomController = options.zoomController || null; // ズームコントローラーのオプション
		this.stampManager = options.stampManager || null; // スタンプマネージャーのオプション
		this.bboxManager = options.bboxManager || null; // bboxマネージャーのオプション
		this.textTranslation = options.textTranslation || null; // テキスト翻訳のオプション
		this.translationPanelManager = options.translationPanelManager || null; // 翻訳パネルマネージャーのオプション
		this.pageIndicatorController = options.pageIndicatorController || null; // ページインジケータコントローラのオプション
		this.callbacks = options.callbacks || {};

		this.initElements();

		// スクロール同期イベント
		this.isScrollSyncing = false;
		this.setupScrollSync();
	}

	// ===== 1. 初期化・要素取得・イベント登録 =====

	initElements() {   
		this.canvasLeft = document.getElementById('pdfCanvasLeft');
		this.canvasRight = document.getElementById('pdfCanvasRight');
		this.ctxLeft = this.canvasLeft.getContext('2d');
		this.ctxRight = this.canvasRight.getContext('2d');
		this.overlayLeft = document.getElementById('overlayLeft');
		this.overlayRight = document.getElementById('overlayRight');
        
		this.deleteAllBboxes = document.getElementById('deleteAllBboxes');
		this.resetToDefaultButton = document.getElementById('resetToDefaultButton');
	}

	setupScrollSync() {
		// 両方の要素を取得してテストする
		const leftContainer = document.querySelector('.canvas-container.left');
		const centerContainer = document.querySelector('.canvas-container.center');
		const leftWrapper = document.querySelector('.canvas-container.left .canvas-wrapper');
		const centerWrapper = document.querySelector('.canvas-container.center .canvas-wrapper');
        
		if (!leftContainer || !centerContainer) {
			console.warn('Canvas containers not found for scroll synchronization');
			return;
		}
        
		// 最適化されたスクロール同期
		let isScrollSyncing = false;
		let scrollAnimationFrame = null;
        
		const syncScrollOptimized = (source, target, property) => {
			if (!isScrollSyncing) {
				isScrollSyncing = true;
                
				if (scrollAnimationFrame) {
					cancelAnimationFrame(scrollAnimationFrame);
				}
                
				scrollAnimationFrame = requestAnimationFrame(() => {
					target[property] = source[property];
					isScrollSyncing = false;
					scrollAnimationFrame = null;
				});
			}
		};
        
		// コンテナレベルでのスクロール同期（最適化版）
		leftContainer.addEventListener('scroll', (e) => {
			syncScrollOptimized(e.target, centerContainer, 'scrollLeft');
		}, { passive: true });
        
		centerContainer.addEventListener('scroll', (e) => {
			syncScrollOptimized(e.target, leftContainer, 'scrollLeft');
		}, { passive: true });
        
		// ラッパーレベルでのスクロール同期（最適化版）
		if (leftWrapper && centerWrapper) {
			leftWrapper.addEventListener('scroll', (e) => {
				syncScrollOptimized(e.target, centerWrapper, 'scrollTop');
			}, { passive: true });
            
			centerWrapper.addEventListener('scroll', (e) => {
				syncScrollOptimized(e.target, leftWrapper, 'scrollTop');
			}, { passive: true });
		}
	}

	// ===== 2. PDFページ描画・再描画 =====

	// === PDF描画（最適化版） ===
	async renderPage(pageNumber, side = 'both') {
		try {
			const page = await this.globalState.pdfDoc.getPage(pageNumber);
			const viewport = page.getViewport({ scale: this.zoomController.getScale() });
            
			// 描画対象を決定
			const renderTargets = this._determineRenderTargets(side);
			const renderPromises = [];
            
			// 効率的な描画処理
			for (const target of renderTargets) {
				const canvas = target === 'left' ? this.canvasLeft : this.canvasRight;
				const ctx = target === 'left' ? this.ctxLeft : this.ctxRight;
                
				// キャンバスサイズが変更された場合のみリサイズ
				if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
					canvas.width = viewport.width;
					canvas.height = viewport.height;
				}
                
				const renderContext = {
					canvasContext: ctx,
					viewport: viewport
				};
                
				renderPromises.push(page.render(renderContext).promise);
			}
            
			// 並列描画実行
			await Promise.all(renderPromises);
            
			// OCRボックスを効率的に描画
			this.renderOCRBoxesOptimized(pageNumber, viewport);
            
			// 現在のページのスタンプを再描画
			this.stampManager.redrawCurrentPageStamps();
            
			// ズームコントロールを更新
			this.zoomController.updateZoomControls();
            
		} catch (error) {
			console.error('ページの描画に失敗しました:', error);
			alert('ページの描画に失敗しました。');
		}
	}
    
	// 描画対象決定のヘルパー
	_determineRenderTargets(side) {
		switch (side) {
			case 'left': return ['left'];
			case 'right': return ['right'];
			case 'both':
			default: return ['left', 'right'];
		}
	}

	updateRightPreview() {
		// 現在のページを右側のみ再描画して右側プレビューを更新（最適化版）
		if (this.globalState.pdfDoc && this.globalState.currentPage) {
			// ⚠️ 注意: 右側のみ更新するが、他の操作で左側も確実に同期される
			// 理由: コールバックが常に'both'で呼び出されるため同期は保証される
			this.renderPage(this.globalState.currentPage, 'right');
            
			// インジケータの数値を再計算して更新
			this.callbacks.recalculateCurrentPageIndicatorCount();
            
			// 一括選択モードが有効な場合、新しいbboxに適用
			if (this.globalState.isDeleteTranslationMode) {
				setTimeout(() => {
					this.callbacks.enableDeleteTranslationMode();
				}, 100); // 描画完了を待つ
			}
            
			// 確認ステータスの表示を更新
			setTimeout(() => {
				if (this.updateAllBboxConfirmationAppearance) {
					this.updateAllBboxConfirmationAppearance();
				}
			}, 100);
		}
	}

	// 特定のbboxの描画を更新（最適化版）
	refreshBboxRendering(bboxId) {
		// 右側のbboxのみ再描画（幅調整は右側の翻訳表示にのみ影響）
		const rightBox = this.overlayRight.querySelector(`[data-bbox-id="${bboxId}"]`);
		if (rightBox) {
			const bboxData = this.bboxManager.getBboxData(bboxId);
			if (bboxData && Utils.containsJapanese(bboxData.text) && !this.bboxManager.isBboxDeleted(bboxId)) {
				const displayText = this.bboxManager.getBboxEditedTranslation(bboxId) || this.globalState.bboxTranslations.get(bboxId);
				if (displayText) {
					// 効率的な更新：新しい要素を作成してreplaceWith
					const newBox = this.createOCRBoxOptimized(bboxId, this.canvasRight, 'right', displayText);
					if (newBox) {
						rightBox.replaceWith(newBox);
					}
				}
			} else {
				// 条件に合わない場合は削除
				rightBox.remove();
			}
		}
	}
    
	// ===== 3. OCRボックス描画・管理 =====
    
	// === OCRボックス描画（最適化版） ===
	renderOCRBoxesOptimized(pageNumber, viewport) {
		// 既存のOCRボックスを効率的にクリア
		this.clearOCRBoxesOptimized();
        
		if (!this.globalState.ocrData || !this.globalState.ocrData.results || this.globalState.ocrData.results.length === 0) {
			return;
		}
        
		// OCRデータから現在のページを検索
		const result = this.globalState.ocrData.results[0];
		const currentPageData = result.pages?.find(page => page.pageNum === pageNumber);
        
		if (!currentPageData || !currentPageData.ocrResults) {
			return;
		}
        
		// DocumentFragmentを使用してDOM操作を最適化
		const leftFragment = document.createDocumentFragment();
		const rightFragment = document.createDocumentFragment();
        
		// キャンバスの実際の表示サイズを取得
		const canvasLeftRect = this.canvasLeft.getBoundingClientRect();
		const canvasRightRect = this.canvasRight.getBoundingClientRect();
        
		// キャンバスの実際の描画サイズに合わせてオーバーレイを設定
		this.overlayLeft.style.width = this.canvasLeft.width + 'px';
		this.overlayLeft.style.height = this.canvasLeft.height + 'px';
		this.overlayRight.style.width = this.canvasRight.width + 'px';
		this.overlayRight.style.height = this.canvasRight.height + 'px';
        
		// バッチ処理でOCRボックスを作成
		const translationPromises = [];
		const boxesToRender = [];
        
		currentPageData.ocrResults.forEach(async (ocrResult) => {
			// bboxIDを生成
			const bboxId = this.bboxManager.generateBboxId(pageNumber, ocrResult);
            
			// bboxデータを保存
			this.bboxManager.setBboxData(bboxId, {
				pageNum: pageNumber,
				text: ocrResult.text,
				bbox: ocrResult.bbox,
				ocrResult: ocrResult
			});
            
			// 左側：削除状態に関係なく全てのOCRボックスを表示
			const leftBox = this.createOCRBoxOptimized(bboxId, this.canvasLeft, 'left');
			if (leftBox) leftFragment.appendChild(leftBox);
            
			// 右側：削除されていない日本語を含むもののみ翻訳して表示
			if (Utils.containsJapanese(ocrResult.text) && !this.bboxManager.isBboxDeleted(bboxId)) {
				boxesToRender.push({ bboxId, fragment: rightFragment });
			}
		});
        
		// DOM更新を一括実行
		this.overlayLeft.appendChild(leftFragment);
        
		// 翻訳処理を効率化
		this._handleBatchTranslation(boxesToRender, rightFragment);
        
		// カスタムbboxをレンダリング
		this.renderCustomBboxes(pageNumber);
	}
    
	// 効率的なOCRボックス作成
	createOCRBoxOptimized(bboxId, canvas, side = 'left', displayText = null) {
		const box = document.createElement('div');
		box.className = 'ocr-box';
		box.dataset.bboxId = bboxId;
        
		const bboxData = this.bboxManager.getBboxData(bboxId);
		if (!bboxData) return null;
        
		const ocrResult = bboxData.ocrResult;
		const text = displayText || bboxData.text;
        
		// 日本語が含まれるかチェック
		const hasJapanese = Utils.containsJapanese(bboxData.text);
        
		if (side === 'right') {
			this._setupRightSideBox(box, text, bboxId, hasJapanese);
		} else {
			this._setupLeftSideBox(box, bboxData, bboxId, hasJapanese);
		}
        
		// 座標計算を統一処理で実行
		const position = this._calculateBoxPosition(ocrResult, canvas, bboxId, side);
        
		// スタイル一括設定
		Object.assign(box.style, {
			left: position.left + 'px',
			top: position.top + 'px',
			width: position.width + 'px',
			height: position.height + 'px'
		});
        
		// 右側の場合、カスタムフォントサイズを適用
		if (side === 'right') {
			const scaledFontSize = this._calculateScaledFontSize(bboxId);
			box.style.fontSize = `${scaledFontSize}px`;
			box.style.lineHeight = `${scaledFontSize * 1.2}px`;
		}
        
		return box;
	}
    
	// バッチ翻訳処理
	async _handleBatchTranslation(boxesToRender, rightFragment) {
		for (const { bboxId, fragment } of boxesToRender) {
			// 編集済み翻訳があるかチェック
			const editedTranslation = this.bboxManager.getBboxEditedTranslation(bboxId);
            
			if (editedTranslation) {
				const box = this.createOCRBoxOptimized(bboxId, this.canvasRight, 'right', editedTranslation);
				if (box) fragment.appendChild(box);
			} else {
				// 既存の翻訳があるかチェック
				const existingTranslation = this.globalState.bboxTranslations.get(bboxId);
                
				if (existingTranslation) {
					const box = this.createOCRBoxOptimized(bboxId, this.canvasRight, 'right', existingTranslation);
					if (box) fragment.appendChild(box);
				} else {
					// 翻訳が必要な場合の処理
					this._handleAsyncTranslationOptimized(bboxId);
				}
			}
		}
        
		// 右側のDOM更新を一括実行
		this.overlayRight.appendChild(rightFragment);
	}
    
	// 右側ボックスのセットアップ
	_setupRightSideBox(box, text, bboxId, hasJapanese) {
		box.classList.add('japanese-text');
		box.textContent = text;
        
		// 確認ステータスに応じてクラスを追加
		const isConfirmed = this.bboxManager.getBboxConfirmationStatus(bboxId);
		if (isConfirmed) {
			box.classList.add('confirmed');
		}
        
		// 折り返し設定を適用
		const isWrapEnabled = this.bboxManager.getBboxWrapSetting(bboxId);
		if (isWrapEnabled) {
			box.style.whiteSpace = 'pre-wrap';
			box.style.wordWrap = 'break-word';
			box.style.lineHeight = '0';
		} else {
			box.style.whiteSpace = 'nowrap';
			box.style.lineHeight = '1';
		}
        
		// 右側のOCRボックスをクリック可能にする
		box.style.pointerEvents = 'auto';
		box.style.cursor = 'pointer';
		box.addEventListener('click', () => {
			this.translationPanelManager.loadOCRBoxIntoPanel(bboxId);
		});
	}
    
	// 左側ボックスのセットアップ
	_setupLeftSideBox(box, bboxData, bboxId, hasJapanese) {
		if (hasJapanese) {
			box.classList.add('japanese');
			// 削除されたbboxの場合は視覚的に区別
			if (this.bboxManager.isBboxDeleted(bboxId)) {
				box.classList.add('deleted');
				box.title = bboxData.text + ' (削除済み - クリックで復活)';
			} else {
				box.title = bboxData.text;
			}
		} else {
			box.title = bboxData.text;
		}
        
		// 左側の全てのbboxをクリック可能にする
		box.style.pointerEvents = 'auto';
		box.style.cursor = 'pointer';
		box.addEventListener('click', () => {
			this.bboxManager.onLeftBboxClicked(bboxId);
		});
	}
    
	// 効率的なOCRボックスクリア
	clearOCRBoxesOptimized() {
		// DOM操作を最小限に
		if (this.overlayLeft.hasChildNodes()) {
			this.overlayLeft.replaceChildren();
		}
		if (this.overlayRight.hasChildNodes()) {
			this.overlayRight.replaceChildren();
		}
	}

	createOCRBox(bboxId, canvas, overlay, side = 'left', displayText = null) {
		// 最適化版を呼び出し（後方互換性のため）
		const box = this.createOCRBoxOptimized(bboxId, canvas, side, displayText);
		if (box) {
			overlay.appendChild(box);
		}
		return box;
	}

	createLoadingOCRBox(bboxId, canvas, overlay) {
		// 最適化版を呼び出し（後方互換性のため）
		const box = this.createLoadingOCRBoxOptimized(bboxId);
		if (box) {
			overlay.appendChild(box);
		}
		return box;
	}
    
	// === キャンバス管理（最適化版） ===
	clearOCRBoxes() {
		// 後方互換性のため古いメソッド名を維持
		this.clearOCRBoxesOptimized();
	}

	// ===== 4. カスタムbbox描画・管理 =====

	renderCustomBboxes(pageNumber) {
		// 現在のページのカスタムbboxを探す
		for (const [bboxId, bboxData] of this.globalState.bboxData.entries()) {
			if (bboxData.isCustom && bboxData.pageNum === pageNumber && !this.bboxManager.isBboxDeleted(bboxId)) {
				// 右側にカスタムbboxを表示
				// カスタムbboxは日本語の有無に関係なく翻訳処理を実行
				// 編集済み翻訳があるかチェック
				const editedTranslation = this.bboxManager.getBboxEditedTranslation(bboxId);
                
				if (editedTranslation) {
					// 編集済み翻訳がある場合は直接表示
					this.createOCRBox(bboxId, this.canvasRight, this.overlayRight, 'right', editedTranslation);
				} else {
					// 既存の翻訳があるかチェック
					const existingTranslation = this.globalState.bboxTranslations.get(bboxId);
                    
					if (existingTranslation) {
						// 既存の翻訳がある場合は直接表示
						this.createOCRBox(bboxId, this.canvasRight, this.overlayRight, 'right', existingTranslation);
					} else {
						// 翻訳が必要な場合の処理
						this._handleAsyncTranslation(bboxId, this.canvasRight, this.overlayRight, 'right');
					}
				}
			}
		}
	}

	/**
	 * カスタムbboxの描画処理
	 */
	renderCustomBbox(customBboxId, customBboxData) {
		// 現在のページでないなら描画しない
		if (customBboxData.pageNum !== this.globalState.currentPage) {
			return;
		}
        
		// 削除済みなら描画しない
		if (this.bboxManager.isBboxDeleted(customBboxId)) {
			return;
		}
        
		// 統一処理で翻訳表示を実行
		this._handleTranslationDisplay(customBboxId, 'right');
	}

	// ===== ユーティリティ関数（重複コード統一） =====
    
	// 編集済み翻訳の確認と表示を統一処理
	_handleTranslationDisplay(bboxId, side) {
		const canvas = side === 'right' ? this.canvasRight : this.canvasLeft;
		const overlay = side === 'right' ? this.overlayRight : this.overlayLeft;
        
		// 編集済み翻訳があるかチェック
		const editedTranslation = this.bboxManager.getBboxEditedTranslation(bboxId);
        
		if (editedTranslation) {
			// 編集済み翻訳がある場合は直接表示
			this.createOCRBox(bboxId, canvas, overlay, side, editedTranslation);
		} else {
			// 既存の翻訳があるかチェック
			const existingTranslation = this.globalState.bboxTranslations.get(bboxId);
            
			if (existingTranslation) {
				// 既存の翻訳がある場合は直接表示
				this.createOCRBox(bboxId, canvas, overlay, side, existingTranslation);
			} else {
				// 翻訳が必要な場合の処理
				this._handleAsyncTranslation(bboxId, canvas, overlay, side);
			}
		}
	}
    
	// 非同期翻訳処理の統一処理（互換性維持）
	async _handleAsyncTranslation(bboxId, canvas, overlay, side) {
		// 最適化版を呼び出し
		await this._handleAsyncTranslationOptimized(bboxId);
	}
    
	// 非同期翻訳処理の最適化版
	async _handleAsyncTranslationOptimized(bboxId) {
		const bboxData = this.bboxManager.getBboxData(bboxId);
		if (!bboxData) return;
        
		// まず翻訳中インジケーターを表示
		const loadingBox = this.createLoadingOCRBoxOptimized(bboxId);
		if (loadingBox) {
			this.overlayRight.appendChild(loadingBox);
		}
        
		try {
			// 翻訳キャッシュを効率的に活用
			const cacheKey = this._generateTranslationCacheKey(bboxData.text);
			let translatedText = this.globalState.translationCache.get(cacheKey);
            
			if (!translatedText) {
				// 翻訳を実行
				translatedText = await this.textTranslation.translateText(bboxData.text);
				// キャッシュに保存
				this.globalState.translationCache.set(cacheKey, translatedText);
			}
            
			// 翻訳結果をbboxIDベースで保存
			this.globalState.bboxTranslations.set(bboxId, translatedText);
            
			// ローディングボックスを削除
			if (loadingBox && loadingBox.parentNode) {
				loadingBox.parentNode.removeChild(loadingBox);
			}
            
			// 翻訳結果で新しいボックスを作成
			const translatedBox = this.createOCRBoxOptimized(bboxId, this.canvasRight, 'right', translatedText);
			if (translatedBox) {
				this.overlayRight.appendChild(translatedBox);
			}
		} catch (error) {
			console.error('翻訳エラー:', error);
            
			// エラーの場合もローディングボックスを削除
			if (loadingBox && loadingBox.parentNode) {
				loadingBox.parentNode.removeChild(loadingBox);
			}
            
			// エラー時は元のテキストを表示
			const errorBox = this.createOCRBoxOptimized(bboxId, this.canvasRight, 'right', bboxData.text);
			if (errorBox) {
				this.overlayRight.appendChild(errorBox);
			}
		}
	}
    
	// 最適化されたローディングボックス作成
	createLoadingOCRBoxOptimized(bboxId) {
		const box = document.createElement('div');
		box.className = 'ocr-box translating';
		box.dataset.bboxId = bboxId;
        
		const bboxData = this.bboxManager.getBboxData(bboxId);
		if (!bboxData) return null;
        
		const ocrResult = bboxData.ocrResult;
        
		// 座標計算を統一処理で実行
		const position = this._calculateBoxPosition(ocrResult, this.canvasRight, bboxId, 'right');
        
		// カスタムフォントサイズを適用
		const scaledFontSize = this._calculateScaledFontSize(bboxId);
        
		// スタイル一括設定
		Object.assign(box.style, {
			left: position.left + 'px',
			top: position.top + 'px',
			width: position.width + 'px',
			height: position.height + 'px',
			fontSize: `${scaledFontSize}px`,
			lineHeight: `${scaledFontSize * 1.2}px`
		});
        
		return box;
	}
    
	// 翻訳キャッシュキー生成
	_generateTranslationCacheKey(text) {
		// テキストのハッシュ化（簡易版）
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // 32bit整数に変換
		}
		return `text_${hash}_${text.length}`;
	}
    
	// 座標計算の統一処理
	_calculateBoxPosition(ocrResult, canvas, bboxId, side) {
		// キャンバスの実際の描画サイズを使用（スケールが反映されたサイズ）
		const displayWidth = canvas.width;
		const displayHeight = canvas.height;
        
		// 相対座標を描画サイズに合わせて絶対座標に変換
		const left = ocrResult.bbox.left * displayWidth;
		const top = ocrResult.bbox.top * displayHeight;
		let width = (ocrResult.bbox.right - ocrResult.bbox.left) * displayWidth;
		const height = (ocrResult.bbox.bottom - ocrResult.bbox.top) * displayHeight;
        
		// 右側の場合、カスタム幅調整を適用（右端のみ調整、左端は固定）
		if (side === 'right') {
			const customWidthRatio = this.globalState.bboxWidths.get(bboxId) || 1.0;
			width = width * customWidthRatio;
		}
        
		return { left, top, width, height };
	}
    
	// フォントサイズ計算の統一処理
	_calculateScaledFontSize(bboxId) {
		const customFontSize = this.bboxManager.getBboxFontSize(bboxId);
		// ズーム率を考慮したフォントサイズを計算
		const zoomRatio = this.zoomController.getScale() / this.zoomController.getDefaultScale();
		return customFontSize * zoomRatio;
	}
    
	// ===== 5. UI・インジケータ・進捗管理 =====

	// すべてのbboxの確認ステータス表示を更新
	updateAllBboxConfirmationAppearance() {
		const rightBoxes = this.overlayRight.querySelectorAll('.japanese-text');
		rightBoxes.forEach(box => {
			const bboxId = box.dataset.bboxId;
			if (bboxId) {
				const isConfirmed = this.bboxManager.getBboxConfirmationStatus(bboxId);
				if (isConfirmed) {
					box.classList.add('confirmed');
				} else {
					box.classList.remove('confirmed');
				}
			}
		});
	}


    
	// === 8. 範囲選択機能 ===
    
	// === 範囲選択の共通処理 ===
	_addRemoveEventListeners(container, events, isAdd = true) {
		const method = isAdd ? 'addEventListener' : 'removeEventListener';
		events.forEach(({ event, handler }) => {
			container[method](event, handler);
		});
	}

	_getAreaSelectionEvents() {
		return [
			{ event: 'mousedown', handler: this.handleAreaSelectionStart.bind(this) },
			{ event: 'mousemove', handler: this.handleAreaSelectionMove.bind(this) },
			{ event: 'mouseup', handler: this.handleAreaSelectionEnd.bind(this) },
			{ event: 'mouseleave', handler: this.handleAreaSelectionCancel.bind(this) }
		];
	}

	enableAreaSelection() {
		// 右側プレビューのコンテナを取得
		this.rightCanvasContainer = this.overlayRight.parentElement;
        
		// 範囲選択用の変数を初期化
		this.isAreaSelecting = false;
		this.areaSelectionStart = null;
		this.selectionRect = null;
        
		// イベントリスナーを追加
		this._addRemoveEventListeners(this.rightCanvasContainer, this._getAreaSelectionEvents(), true);
	}
    
	disableAreaSelection() {
		if (!this.rightCanvasContainer) return;
        
		// イベントリスナーを削除
		this._addRemoveEventListeners(this.rightCanvasContainer, this._getAreaSelectionEvents(), false);
        
		// 範囲選択UIをクリア
		this.clearAreaSelection();
        
		// CSSクラスを削除
		this.rightCanvasContainer.classList.remove('area-selecting');
	}
    
	// === 座標計算の共通処理 ===
	_getRelativePosition(event) {
		const rect = this.rightCanvasContainer.getBoundingClientRect();
		return {
			x: event.clientX - rect.left + this.rightCanvasContainer.scrollLeft,
			y: event.clientY - rect.top + this.rightCanvasContainer.scrollTop
		};
	}

	_calculateRectBounds(start, end) {
		return {
			left: Math.min(start.x, end.x),
			top: Math.min(start.y, end.y),
			width: Math.abs(end.x - start.x),
			height: Math.abs(end.y - start.y)
		};
	}

	handleAreaSelectionStart(event) {
		if (!this.globalState.isDeleteTranslationMode) return;
        
		// bbox要素をクリックした場合は範囲選択を開始しない
		if (event.target.classList.contains('ocr-box')) {
			return;
		}
        
		event.preventDefault();
        
		// 範囲選択開始
		this.isAreaSelecting = true;
		this.rightCanvasContainer.classList.add('area-selecting');
        
		this.areaSelectionStart = this._getRelativePosition(event);
        
		// 選択矩形を作成
		this.createSelectionRect();
        
	}
    
	handleAreaSelectionMove(event) {
		if (!this.isAreaSelecting || !this.areaSelectionStart) return;
        
		event.preventDefault();
        
		const currentPos = this._getRelativePosition(event);
        
		// 選択矩形を更新
		this.updateSelectionRect(this.areaSelectionStart, currentPos);
        
		// 交差するbboxをハイライト
		this.highlightIntersectingBboxes();
	}
    
	handleAreaSelectionEnd(event) {
		if (!this.isAreaSelecting) return;
        
		event.preventDefault();
        
		// 交差するbboxを選択に追加
		this.selectIntersectingBboxes();
        
		// 範囲選択終了
		this.finishAreaSelection();
	}
    
	handleAreaSelectionCancel() {
		if (!this.isAreaSelecting) return;
        
		// 範囲選択をキャンセル
		this.finishAreaSelection();
	}
    
	createSelectionRect() {
		if (this.selectionRect) {
			this.selectionRect.remove();
		}
        
		this.selectionRect = document.createElement('div');
		this.selectionRect.className = 'selection-rectangle';
		this.rightCanvasContainer.appendChild(this.selectionRect);
	}
    
	updateSelectionRect(start, end) {
		if (!this.selectionRect) return;
        
		const bounds = this._calculateRectBounds(start, end);
        
		this.selectionRect.style.left = `${bounds.left}px`;
		this.selectionRect.style.top = `${bounds.top}px`;
		this.selectionRect.style.width = `${bounds.width}px`;
		this.selectionRect.style.height = `${bounds.height}px`;
		this.selectionRect.style.display = 'block';
	}
    
	// === 矩形交差判定の共通処理 ===
	_isRectIntersecting(rect1, rect2) {
		return !(
			rect1.right < rect2.left ||
			rect1.left > rect2.right ||
			rect1.bottom < rect2.top ||
			rect1.top > rect2.bottom
		);
	}

	_getElementRect(element) {
		return {
			left: element.offsetLeft,
			top: element.offsetTop,
			right: element.offsetLeft + element.offsetWidth,
			bottom: element.offsetTop + element.offsetHeight
		};
	}

	highlightIntersectingBboxes() {
		if (!this.selectionRect) return;
        
		const selectionBounds = this.selectionRect.getBoundingClientRect();
		const containerBounds = this.rightCanvasContainer.getBoundingClientRect();
        
		// コンテナ基準の座標に変換
		const selectionRect = {
			left: selectionBounds.left - containerBounds.left + this.rightCanvasContainer.scrollLeft,
			top: selectionBounds.top - containerBounds.top + this.rightCanvasContainer.scrollTop,
			right: selectionBounds.right - containerBounds.left + this.rightCanvasContainer.scrollLeft,
			bottom: selectionBounds.bottom - containerBounds.top + this.rightCanvasContainer.scrollTop
		};
        
		// すべてのbboxから交差判断（最適化版）
		const rightOcrBoxes = this.overlayRight.querySelectorAll('.ocr-box');
		
		// 効率的な交差判定のためのバッチ処理
		const updateTasks = [];
		rightOcrBoxes.forEach(box => {
			const currentlyIntersecting = box.classList.contains('intersecting');
			const boxRect = this._getElementRect(box);
			const shouldIntersect = this._isRectIntersecting(selectionRect, boxRect);
			
			if (currentlyIntersecting !== shouldIntersect) {
				updateTasks.push({ box, shouldIntersect });
			}
		});
		
		// DOM更新を一括実行
		if (updateTasks.length > 0) {
			requestAnimationFrame(() => {
				updateTasks.forEach(({ box, shouldIntersect }) => {
					if (shouldIntersect) {
						box.classList.add('intersecting');
					} else {
						box.classList.remove('intersecting');
					}
				});
			});
		}
	}
    
	selectIntersectingBboxes() {
		const intersectingBoxes = this.overlayRight.querySelectorAll('.ocr-box.intersecting');
		let addedCount = 0;
        
		intersectingBoxes.forEach(box => {
			const bboxId = box.dataset.bboxId;
			if (!this.globalState.selectedBboxIds.has(bboxId)) {
				this.globalState.selectedBboxIds.add(bboxId);
				box.classList.add('batch-selected');
				addedCount++;
			}
			box.classList.remove('intersecting');
		});
        
		if (addedCount > 0) {
			this.callbacks.updateDeleteTranslationModeUI();
		}
	}
    
	finishAreaSelection() {
		this.isAreaSelecting = false;
		this.areaSelectionStart = null;
		this.rightCanvasContainer.classList.remove('area-selecting');
        
		// 選択矩形を削除
		this.clearAreaSelection();
        
		// 交差ハイライトをクリア
		const intersectingBoxes = this.overlayRight.querySelectorAll('.ocr-box.intersecting');
		intersectingBoxes.forEach(box => {
			box.classList.remove('intersecting');
		});
	}
    
	clearAreaSelection() {
		if (this.selectionRect) {
			this.selectionRect.remove();
			this.selectionRect = null;
		}
	}

	// === 9. UI外観の更新 ===
    
	updateBboxConfirmationAppearance(bboxId, isConfirmed) {
		// 右側プレビューのbboxを取得
		const rightBox = this.overlayRight.querySelector(`[data-bbox-id="${bboxId}"]`);
		if (rightBox && rightBox.classList.contains('japanese-text')) {
			if (isConfirmed) {
				rightBox.classList.add('confirmed');
			} else {
				rightBox.classList.remove('confirmed');
			}
		}
	}
}

