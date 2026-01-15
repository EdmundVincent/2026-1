import { Utils } from '../utils/utils.js';

/**
 * HandleFiles - ファイル処理管理クラス
 * 
 * PDFファイルとOCRファイルのアップロード、読み込み、処理を管理する。
 * ドラッグ&ドロップ、ファイル選択ダイアログ、DX Suite OCR連携などの
 * ファイル関連の全機能を統合管理する。
 * 
 * 主要機能:
 * - PDFファイルの読み込み・表示
 * - OCRファイルの読み込み・解析
 * - DX Suite OCR API連携
 * - ドラッグ&ドロップ対応
 * - ファイルキャッシュ機能
 * - エラーハンドリング
 */
export class HandleFiles {
	constructor(options = {}) {
		this.globalState = options.globalState;
		this.callbacks = options.callbacks || {};

		this.initializeElements();
		this.initializeEvents();
		this.setupDragAndDrop();
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * ファイルタイプを検証
	 */
	validateFileType(file, expectedType, expectedExtension = null) {
		if (expectedType === 'application/pdf') {
			return file.type === 'application/pdf';
		}
		return false;
	}

	/**
	 * ファイル処理の共通エラーハンドリング
	 */
	handleFileError(error, fileName, fileType) {
		const errorMessage = `${fileType}の読み込みに失敗しました`;
		console.error(`${errorMessage}:`, error);
		alert(`${errorMessage}: ${fileName}`);
	}

	/**
	 * キャンバスの初期化とクリア
	 */
	clearCanvas(ctx, canvas) {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	/**
	 * スクロール位置をリセット
	 */
	resetScrollPosition() {
		setTimeout(() => {
			if (this.canvasContainerLeft && this.canvasContainerRight) {
				this.canvasContainerLeft.scrollTop = 0;
				this.canvasContainerLeft.scrollLeft = 0;
				this.canvasContainerRight.scrollTop = 0;
				this.canvasContainerRight.scrollLeft = 0;
			}
		}, 100);
	}

	/**
	 * グローバル状態のクリア
	 */
	clearGlobalState() {
		this.globalState.pdfDoc = null;
		this.globalState.ocrData = null;
		this.globalState.originalPdfFile = null;
		this.globalState.currentPage = 1;
		this.globalState.totalPages = 0;
	}

	/**
	 * ファイル入力要素のクリア
	 */
	clearFileInputs() {
		this.pdfInput.value = '';
	}

	/**
	 * PDF読み込み後の共通処理
	 */
	handlePDFLoadSuccess(file) {
		this.showPDFViewer();
		this.updateFileName('pdf', file.name);
		this.callbacks.updatePageIndicator();
		this.callbacks.renderPage(this.globalState.currentPage);
		this.updateControls();
		this.updateDownloadButtonState();
	}

	// === 初期化メソッド ===

	initializeElements() {
		this.dropZone = document.getElementById('dropZone');
		this.pdfInput = document.getElementById('pdfInput');
		this.resetButton = document.getElementById('resetButton');

		// ファイル名表示用の要素を取得
		this.fileStatus = document.getElementById('fileStatus');
		this.pdfFileName = document.getElementById('pdfFileName');
		this.ocrProcessStatus = document.getElementById('ocrProcessStatus');

		this.pdfViewer = document.getElementById('pdfViewer');
		this.canvasLeft = document.getElementById('pdfCanvasLeft');
		this.canvasRight = document.getElementById('pdfCanvasRight');
		this.canvasContainerLeft = this.canvasLeft.closest('.canvas-container');
		this.canvasContainerRight = this.canvasRight.closest('.canvas-container');
		this.ctxLeft = this.canvasLeft.getContext('2d');
		this.ctxRight = this.canvasRight.getContext('2d');

		// ダウンロードボタン要素
		this.downloadPdf = document.getElementById('downloadPdf');
		this.downloadCsv = document.getElementById('downloadCsv');

		this.prevPageBtn = document.getElementById('prevPage');
		this.nextPageBtn = document.getElementById('nextPage');
		this.pageInfo = document.getElementById('pageInfo');

		this.pageIndicator = document.getElementById('pageIndicator');
	}

	initializeEvents() {
		this.pdfInput.addEventListener('change', (e) => this.handlePDFUpload(e));
		this.resetButton.addEventListener('click', () => this.resetToInitialState());
	}

	getFileName() {
		return this.pdfFileName;
	}

	/**
	 * ファイル名を更新してUIに表示する
	 * @param {string} type - ファイルタイプ ('pdf', 'ocr', または 'ocr_status')
	 * @param {string} fileName - ファイル名またはステータスメッセージ
	 */
	updateFileName(type, fileName) {
		this.fileStatus.style.display = 'block';
        
		if (type === 'pdf') {
			this.pdfFileName.textContent = `PDFファイル: ${fileName}`;
			this.pdfFileName.classList.add('loaded');
		} else if (type === 'ocr' || type === 'ocr_status') {
			this.ocrProcessStatus.textContent = `OCR処理: ${fileName}`;
			// 完了状態の判定を改善
			if (fileName.includes('完了')) {
				this.ocrProcessStatus.classList.add('loaded');
			} else {
				this.ocrProcessStatus.classList.remove('loaded');
			}
		}
	}

	resetFileNames(){
		// ファイル名表示をリセット
		this.pdfFileName.textContent = 'PDFファイル: 未選択';
		this.pdfFileName.classList.remove('loaded');
		this.ocrProcessStatus.textContent = 'OCR処理: 待機中';
		this.ocrProcessStatus.classList.remove('loaded');
        
		// ファイルステータスを非表示にする
		this.fileStatus.style.display = 'none';
	}

	setupDragAndDrop() {
		const dropZone = this.dropZone;
        
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			dropZone.addEventListener(eventName, this.preventDefaults, false);
			document.body.addEventListener(eventName, this.preventDefaults, false);
		});
        
		['dragenter', 'dragover'].forEach(eventName => {
			dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
		});
        
		['dragleave', 'drop'].forEach(eventName => {
			dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
		});
        
		dropZone.addEventListener('drop', (e) => this.handleDrop(e), false);
	}

	preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	handleDrop(e) {
		const dt = e.dataTransfer;
		const files = dt.files;
        
		Array.from(files).forEach(file => {
			if (this.validateFileType(file, 'application/pdf')) {
				this.handlePDFFile(file);
			} else {
				alert(`サポートされていないファイル形式です: ${file.name}\nPDFファイルをドロップしてください。`);
			}
		});
	}

	//PDFのアップロード処理
	async handlePDFUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		this.handlePDFFile(file);
	}

	async handlePDFFile(file) {
		if (!this.validateFileType(file, 'application/pdf')) {
			alert('PDFファイルを選択してください。');
			return;
		}
        
		// PDF.jsが読み込まれているかチェック
		if (typeof pdfjsLib === 'undefined') {
			alert('PDF.jsライブラリが読み込まれていません。ページを再読み込みしてください。');
			return;
		}
        
		try {
			// ファイル参照を保存（PDF生成用）
			this.globalState.originalPdfFile = file;
            
			const arrayBuffer = await file.arrayBuffer();
            
			// PDF.js設定
			this.globalState.pdfDoc = await pdfjsLib.getDocument({ 
				data: arrayBuffer,
				// CMapを使用する設定
				cMapUrl: 'https://unpkg.com/pdfjs-dist@2.16.105/cmaps/',
				cMapPacked: true,
				// 標準フォントのみ使用
				standardFontDataUrl: ''
			}).promise;
			this.globalState.totalPages = this.globalState.pdfDoc.numPages;
			this.globalState.currentPage = 1;
            
			this.handlePDFLoadSuccess(file);
			
			// PDF読み込み後、自動的にOCR処理を開始
			await this.processOCRFromAPI(file);
		} catch (error) {
			this.handleFileError(error, file.name, 'PDF');
		}
	}

	showPDFViewer() {
		this.pdfViewer.style.display = 'block';
		this.updateDownloadButtonState();
		this.resetScrollPosition();
	}

	updateDownloadButtonState() {
		// PDFとOCRの両方がロードされている場合のみダウンロードボタンを有効化
		const shouldEnable = !!(this.globalState.pdfDoc && this.globalState.ocrData);
		
		if (this.downloadPdf) {
			this.downloadPdf.disabled = !shouldEnable;
		}
		
		if (this.downloadCsv) {
			this.downloadCsv.disabled = !shouldEnable;
		}
	}

	updateControls() {
		this.prevPageBtn.disabled = this.globalState.currentPage <= 1;
		this.nextPageBtn.disabled = this.globalState.currentPage >= this.globalState.totalPages;
		this.pageInfo.textContent = `ページ ${this.globalState.currentPage} / ${this.globalState.totalPages}`;
		this.callbacks.updateZoomControls();
		this.callbacks.updatePageIndicatorCurrent();
	}

	async handleOCRUpload(event) {
		// このメソッドは使用されなくなりました（DX Suite API連携版では不要）
	}

	async handleOCRFile(file) {
		// このメソッドは使用されなくなりました（DX Suite API連携版では不要）
	}

	/**
	 * DX Suite APIを使用してPDFのOCR処理を実行
	 */
	async processOCRFromAPI(file) {
		try {
			// OCR処理開始をユーザーに通知
			this.updateFileName('ocr', 'DX Suite OCR処理中...');
			
			// バックエンドのURL取得
			const backendUrl = this.getBackendUrl();
			
			// FormDataを作成してPDFファイルを送信
			const formData = new FormData();
			formData.append('file', file);
			
			// API呼び出し
			const response = await fetch(`${backendUrl}/api/upload-pdf`, {
				method: 'POST',
				body: formData
			});
			
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.detail || `HTTP ${response.status}`);
			}
			
			const result = await response.json();
			
			// OCRデータをグローバルステートに保存（py4互換形式に変換）
			// DX Suite APIからは直接配列が返されるが、既存のコードは{results: [...]}形式を期待
			this.globalState.ocrData = {
				results: result.ocr_data
			};
			
			// OCRレスポンスから実際のファイル名を取得
			const ocrFileName = result.ocr_data && result.ocr_data.length > 0 && result.ocr_data[0].fileName 
				? result.ocr_data[0].fileName 
				: file.name;
			
			// OCR処理完了をステータスのみ表示（ファイル名は上部に表示済み）
			this.updateFileName('ocr', 'DX Suite OCR完了');
			
			// ページインジケーターとダウンロードボタンの状態を更新
			this.callbacks.updatePageIndicator();
			this.updateDownloadButtonState();
			
			// OCR処理が完了したら現在のページを再描画
			if (this.globalState.pdfDoc) {
				this.callbacks.renderPage(this.globalState.currentPage);
			}
			
		} catch (error) {
			console.error('DX Suite OCR処理エラー:', error);
			this.updateFileName('ocr', 'OCR処理エラー');
			alert(`OCR処理に失敗しました: ${error.message}`);
		}
	}

	/**
	 * バックエンドAPIのURLを取得
	 */
	getBackendUrl() {
		return window.BACKEND_URL || 'http://localhost:8000';
	}

	resetToInitialState() {
		// データをクリア
		this.clearGlobalState();
		this.callbacks.setDefaultScale();
        
		// UIをリセット
		this.pdfViewer.style.display = 'none';
		this.pageIndicator.style.display = 'none';
		this.resetFileNames();
        
		// ファイル入力をクリア
		this.clearFileInputs();
        
		// キャンバスとオーバーレイをクリア
		this.clearCanvas(this.ctxLeft, this.canvasLeft);
		this.clearCanvas(this.ctxRight, this.canvasRight);
		this.callbacks.clearOCRBoxes();
        
		// ダウンロードボタンの状態を更新
		this.updateDownloadButtonState();
        
		// スクロール位置をリセット
		this.resetScrollPosition();
	}
}

