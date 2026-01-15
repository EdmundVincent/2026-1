import { Utils } from '../utils/utils.js';

export class PDFGenerator {
	constructor(options = {}) {
		this.globalState = options.globalState; 
		this.fileNameHandler = options.fileNameHandler;
		this.callbacks = options.callbacks || {};

		this.initializeElements();
		this.initializeEvents();
	}

	// === ヘルパーメソッド（共通処理） ===

	/**
	 * Canvas座標をPDF座標に変換
	 */
	convertCanvasToPDFCoords(canvasX, canvasY, canvasWidth, canvasHeight, pageWidth, pageHeight) {
		return {
			x: (canvasX / canvasWidth) * pageWidth,
			y: pageHeight - (canvasY / canvasHeight) * pageHeight
		};
	}

	/**
	 * 座標変換とサイズ計算（bbox用）
	 */
	calculateBboxDimensions(ocrResult, pageWidth, pageHeight, bboxId = null) {
		const x = ocrResult.bbox.left * pageWidth;
		const y = pageHeight - (ocrResult.bbox.bottom * pageHeight);
		let width = (ocrResult.bbox.right - ocrResult.bbox.left) * pageWidth;
		const height = (ocrResult.bbox.bottom - ocrResult.bbox.top) * pageHeight;
        
		// カスタム幅調整を適用
		if (bboxId && this.globalState.bboxWidths && this.globalState.bboxWidths.has(bboxId)) {
			const customWidthRatio = this.globalState.bboxWidths.get(bboxId);
			width = width * customWidthRatio;
		}
        
		return { x, y, width, height };
	}

	/**
	 * フォントサイズを計算
	 */
	calculateFontSize(bboxId, height) {
		if (bboxId && this.callbacks.getBboxFontSize) {
			const customFontSize = this.callbacks.getBboxFontSize(bboxId);
			return Math.max(1, Math.min(customFontSize, 24));
		}
		return Math.max(1, Math.min(height * 0.7, 16));
	}

	/**
	 * 白背景の矩形を描画
	 */
	drawWhiteBackground(page, x, y, width, height) {
		page.drawRectangle({
			x: x,
			y: y,
			width: width,
			height: height,
			color: PDFLib.rgb(1, 1, 1),
			opacity: 0.9
		});
	}

	/**
	 * 矩形を描画（塗りつぶし+枠線）
	 */
	drawRectangleWithBorder(page, x, y, width, height, fillColor, borderColor, borderWidth = 2, opacity = 0.1) {
		// 塗りつぶし
		page.drawRectangle({
			x: x,
			y: y,
			width: width,
			height: height,
			color: fillColor,
			opacity: opacity
		});
        
		// 枠線
		page.drawRectangle({
			x: x,
			y: y,
			width: width,
			height: height,
			borderColor: borderColor,
			borderWidth: borderWidth,
			color: PDFLib.rgb(0, 0, 0),
			opacity: 0
		});
	}

	/**
	 * テキスト背景を描画
	 */
	drawTextBackground(page, x, y, width, height, borderColor = null) {
		const options = {
			x: x,
			y: y,
			width: width,
			height: height,
			color: PDFLib.rgb(1, 1, 1),
			opacity: 1
		};

		page.drawRectangle(options);

		if (borderColor) {
			page.drawRectangle({
				...options,
				borderColor: borderColor,
				borderWidth: 1,
				opacity: 0
			});
		}
	}

	/**
	 * 翻訳テキストを取得（優先順位付き）
	 */
	getTranslatedText(bboxId, defaultText = '') {
		return this.callbacks.getBboxEditedTranslation(bboxId) || 
			   this.globalState.bboxTranslations.get(bboxId) || 
			   defaultText;
	}

	/**
	 * 進捗表示を更新
	 */
	updateProgress(current, total, additional = '') {
		this.downloadPdf.textContent = `PDF生成中... (${current}/${total})${additional}`;
	}

	// === 初期化メソッド ===

	initializeElements() {
		this.pdfInput = document.getElementById('pdfInput');

		// ダウンロードボタン要素
		this.downloadPdf = document.getElementById('downloadPdf');

		this.canvasRight = document.getElementById('pdfCanvasRight');
	}

	initializeEvents() {
		// ダウンロードボタンイベント
		this.downloadPdf.addEventListener('click', () => this.downloadTranslatedPdf());
	}

	// === PDF生成・ダウンロード機能 ===
	async downloadTranslatedPdf() {

		if (!this.globalState.pdfDoc || !this.globalState.ocrData) {
			alert('PDFファイルとOCR JSONファイルの両方が必要です。');
			return;
		}

		// ファイルの存在確認
		if (!this.globalState.originalPdfFile && !this.pdfInput.files[0]) {
			alert('PDFファイルが選択されていません。ファイルを再選択してください。');
			return;
		}

		try {
			this.downloadPdf.disabled = true;
			this.downloadPdf.textContent = 'PDF生成中...';

			// 元のPDFファイルデータを取得
			const pdfBytes = await this.getOriginalPdfBytes();
            
			// PDF-libで元PDFを読み込み
			const originalPdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
			const originalPages = originalPdfDoc.getPages();
            
			// 新しいPDFドキュメントを作成（表紙ページ付き）
			const pdfDoc = await PDFLib.PDFDocument.create();
            
			// 表紙ページを最初に追加
			await this.addCoverPage(pdfDoc);
            
			// 元のPDFページをコピーして翻訳テキストを追加
			const copiedPages = await pdfDoc.copyPages(originalPdfDoc, originalPdfDoc.getPageIndices());
            
			// すべてのページの翻訳データを事前に準備
			await this.prepareAllTranslations();
            
			// 幅調整データの確認
			if (this.globalState.bboxWidths && this.globalState.bboxWidths.size > 0) {
				this.updateProgress(0, copiedPages.length, ` (幅調整${this.globalState.bboxWidths.size}個を反映)`);
			}

			// 各ページを新しいPDFドキュメントに追加して翻訳テキストを適用
			for (let pageIndex = 0; pageIndex < copiedPages.length; pageIndex++) {
				const pageNum = pageIndex + 1;
				this.updateProgress(pageNum, copiedPages.length);
                
				// コピーしたページを新しいPDFドキュメントに追加
				const copiedPage = copiedPages[pageIndex];
				pdfDoc.addPage(copiedPage);
                
				// 翻訳テキストを追加
				await this.addTextOverlayToPdfPage(pdfDoc, copiedPage, pageNum);
			}

			// PDFを保存
			const pdfBytesWithText = await pdfDoc.save();
			const pdfFileName = this.fileNameHandler.getFileName();
			const fileName = pdfFileName.textContent.replace('PDFファイル: ', '').replace('.pdf', '') + '_translated_with_cover.pdf';
            
			// ダウンロード
			this.downloadPdfFile(pdfBytesWithText, fileName);

		} catch (error) {
			console.error('PDF生成エラー:', error);
			console.error('エラー詳細:', error.stack);
			alert(`PDF生成中にエラーが発生しました: ${error.message}`);
		} finally {
			this.downloadPdf.disabled = false;
			this.downloadPdf.textContent = '翻訳済みPDFをダウンロード';
		}
	}

	// downloadTranslatedPdfで最初に呼び出される関数
	async getOriginalPdfBytes() {
		// 保存されたファイル参照から取得
		if (this.globalState.originalPdfFile) {
			return await this.globalState.originalPdfFile.arrayBuffer();
		}
        
		// フォールバック: ファイル入力から取得
		const file = this.pdfInput.files[0];
		if (file) {
			return await file.arrayBuffer();
		}
        
		throw new Error('元のPDFファイルが見つかりません');
	}

	// PDFドキュメントに表紙ページを追加
	async addCoverPage(pdfDoc) {
        
		// 新しいページを追加（A4サイズ: 595.28 x 841.89 ポイント）
		const coverPage = pdfDoc.addPage([595.28, 841.89]);
        
		// 標準フォントを埋め込み
		const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
		const boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        
		// ページの寸法を取得
		const { width, height } = coverPage.getSize();
        
		// メインタイトルのテキスト設定（複数行に分割）
		const titleLines = [
			'All Nippon Airways Co., Ltd. approves that, throughout this document,',
			'(i) the words inside the red boxes are translated',
			'into English with accuracy and',
			'(ii) the words inside the blue boxes are not translated',
			'into English because these words are used for',
			'work preparation purposes only.'
		];
		const mainTitleSize = 16; // サイズを小さく調整
		const lineHeight = mainTitleSize * 1.3; // 行間
        
		// タイトル全体の高さを計算
		const totalTextHeight = titleLines.length * lineHeight;
		const startY = height * 0.6 + totalTextHeight / 2; // 中央から少し上に配置
        
		// 各行を描画
		titleLines.forEach((line, index) => {
			const lineWidth = boldFont.widthOfTextAtSize(line, mainTitleSize);
			const lineX = (width - lineWidth) / 2;
			const lineY = startY - (index * lineHeight);
            
			// 各行を赤色で描画
			coverPage.drawText(line, {
				x: lineX,
				y: lineY,
				size: mainTitleSize,
				font: boldFont,
				color: PDFLib.rgb(0.8, 0.1, 0.1), // 赤色 (RGB: 204, 26, 26)
			});
		});
	}

	// すべてのページの翻訳データを事前に準備
	async prepareAllTranslations() {
		// 全ページの翻訳を並列実行（JS版のパターン適用）
		const pagePromises = [];
		for (let pageNum = 1; pageNum <= this.globalState.totalPages; pageNum++) {
			pagePromises.push(this.preparePageTranslations(pageNum));
		}
		await Promise.all(pagePromises);
	}

	// 指定ページの翻訳データを準備
	async preparePageTranslations(pageNum) {
		const result = this.globalState.ocrData.results[0];
		const currentPageData = result.pages?.find(page => page.pageNum === pageNum);
        
		if (!currentPageData || !currentPageData.ocrResults) {
			return;
		}

		// 日本語テキストを収集
		const textsToTranslate = currentPageData.ocrResults
			.filter(ocrResult => {
				const bboxId = this.callbacks.generateBboxId(pageNum, ocrResult);
				return Utils.containsJapanese(ocrResult.text) && !this.callbacks.isBboxDeleted(bboxId);
			})
			.map(ocrResult => ocrResult.text);

		// バッチ翻訳を使用（性能向上）
		if (textsToTranslate.length > 0) {
			if (this.callbacks.translateBatch) {
				// バッチ翻訳が利用可能な場合
				await this.callbacks.translateBatch(textsToTranslate);
			} else {
				// フォールバック: 個別並列翻訳
				const translationPromises = textsToTranslate.map(text => this.callbacks.translateText(text));
				await Promise.all(translationPromises);
			}
		}
	}

	// PDFページに翻訳テキストオーバーレイを追加
	async addTextOverlayToPdfPage(pdfDoc, page, pageNum) {
		const result = this.globalState.ocrData.results[0];
		const currentPageData = result.pages?.find(page => page.pageNum === pageNum);
        
		if (!currentPageData || !currentPageData.ocrResults) {
			return;
		}

		// ページサイズを取得
		const { width: pageWidth, height: pageHeight } = page.getSize();
        
		// フォントを埋め込み
		const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        
		// 日本語OCRボックスに翻訳テキストを追加
		for (const ocrResult of currentPageData.ocrResults) {
			if (Utils.containsJapanese(ocrResult.text)) {
				// bboxIDを生成
				const bboxId = this.callbacks.generateBboxId(pageNum, ocrResult);
                
				// 削除されたbboxはスキップ
				if (this.callbacks.isBboxDeleted(bboxId)) {
					continue;
				}
                
				// 編集済み翻訳を優先して使用
				let translatedText = this.getTranslatedText(bboxId, ocrResult.text);
                
				this.addTextToPDFPage(page, font, pageWidth, pageHeight, ocrResult, translatedText, bboxId);
			}
		}
        
		// カスタムbboxもPDFに追加
		this.addCustomBboxesToPDF(page, font, pageWidth, pageHeight, pageNum);
        
		// スタンプもPDFに追加
		this.addStampsToPDF(page, font, pageWidth, pageHeight, pageNum);
	}

	// PDFページに個別のテキストボックスを追加
	addTextToPDFPage(page, font, pageWidth, pageHeight, ocrResult, translatedText, bboxId = null) {
		// bbox の折り返し設定を確認
		const isWrapEnabled = bboxId ? this.callbacks.getBboxWrapSetting(bboxId) : false;
        
		// 折り返しが無効の場合、改行文字やタブ文字を除去してテキストを1行にする
		if (!isWrapEnabled) {
			translatedText = translatedText.replace(/[\r\n\t]/g, ' ').trim();
		}
        
		// 座標とサイズを計算
		const { x, y, width, height } = this.calculateBboxDimensions(ocrResult, pageWidth, pageHeight, bboxId);
		const fontSize = this.calculateFontSize(bboxId, height);
        
		// 白い背景を描画
		this.drawWhiteBackground(page, x, y, width, height);
        
		// テキストを描画
		if (isWrapEnabled) {
			this.drawMultiLineText(page, font, translatedText, x, y, width, height, fontSize);
		} else {
			this.safeDrawText(page, translatedText, {
				x: x + 2,
				y: y + height / 2 - fontSize / 3,
				size: fontSize,
				font: font,
				color: PDFLib.rgb(0.863, 0.208, 0.271),
			});
		}
	}

	// 複数行テキストを描画
	drawMultiLineText(page, font, text, x, y, width, height, fontSize) {
		// まず既存の改行で分割
		const initialLines = text.split('\n');
		const availableWidth = width - 4; // パディングを考慮
		const lineHeight = fontSize * 1.2; // フォントサイズの1.2倍の行間
		const maxLines = Math.floor(height / lineHeight);
        
		// 各行を幅に基づいてさらに分割
		const wrappedLines = [];
		for (const line of initialLines) {
			const lineWrapped = this.wrapTextToWidth(font, line.trim(), fontSize, availableWidth);
			wrappedLines.push(...lineWrapped);
		}
        
		const actualLines = wrappedLines;
        
		// bboxの上端から下方向に描画するための開始Y座標を計算
		const startY = y + height - fontSize / 2 - fontSize / 3;
        
		actualLines.forEach((line, index) => {
			const lineY = startY - index * lineHeight;
			this.safeDrawText(page, line, {
				x: x + 2,
				y: lineY,
				size: fontSize,
				font: font,
				color: PDFLib.rgb(0.863, 0.208, 0.271),
			});
		});
	}

	// テキストを指定幅に収まるように改行
	wrapTextToWidth(font, text, fontSize, maxWidth) {
		if (!text) return [''];
        
		const words = text.split(' ');
		const lines = [];
		let currentLine = '';
        
		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			const textWidth = font.widthOfTextAtSize(testLine, fontSize);
            
			if (textWidth <= maxWidth) {
				currentLine = testLine;
			} else {
				// 現在の行が空でない場合は追加し、新しい行を開始
				if (currentLine) {
					lines.push(currentLine);
					currentLine = word;
				} else {
					// 単語が長すぎる場合は強制的に追加
					lines.push(word);
				}
			}
		}
        
		// 最後の行を追加
		if (currentLine) {
			lines.push(currentLine);
		}
        
		return lines.length > 0 ? lines : [''];
	}

	// カスタムbboxをPDFに追加
	addCustomBboxesToPDF(page, font, pageWidth, pageHeight, pageNum) {
		// 現在のページのカスタムbboxを探す
		for (const [bboxId, bboxData] of this.globalState.bboxData.entries()) {
			if (bboxData.isCustom && bboxData.pageNum === pageNum && !this.callbacks.isBboxDeleted(bboxId)) {
				const outputText = this.getTranslatedText(bboxId, bboxData.text);
				this.addTextToPDFPage(page, font, pageWidth, pageHeight, bboxData.ocrResult, outputText, bboxId);
			}
		}
	}

	// スタンプをPDFに追加
	addStampsToPDF(page, font, pageWidth, pageHeight, pageNum) {
		// 現在のページのcanvasスタンプを取得
		if (!this.globalState.canvasStamps || this.globalState.canvasStamps.length === 0) {
			return;
		}
        
		// 現在のページのスタンプのみを処理
		const currentPageStamps = this.globalState.canvasStamps.filter(stamp => stamp.pageNum === pageNum);
        
		for (const stamp of currentPageStamps) {
			this.addStampToPDFPage(page, font, pageWidth, pageHeight, stamp);
		}
	}

	// 個別のスタンプをPDFページに追加
	addStampToPDFPage(page, font, pageWidth, pageHeight, stamp) {
		// Canvas座標からPDF座標への変換
		const canvasWidth = this.canvasRight.width;
		const canvasHeight = this.canvasRight.height;
        
		// スタンプの座標とサイズをPDF座標系に変換
		const pdfX = (stamp.x / canvasWidth) * pageWidth;
		const pdfY = pageHeight - ((stamp.y + stamp.height) / canvasHeight) * pageHeight;
		const pdfWidth = (stamp.width / canvasWidth) * pageWidth;
		const pdfHeight = (stamp.height / canvasHeight) * pageHeight;
        
		const blueColor = PDFLib.rgb(0, 0.48, 1);
        
		// スタンプの四角を描画（塗りつぶし+枠線）
		this.drawRectangleWithBorder(page, pdfX, pdfY, pdfWidth, pdfHeight, blueColor, blueColor, 2, 0.1);
        
		// スタンプテキストを描画（四角の上に配置）
		if (stamp.text && pdfWidth > 30) {
			const fontSize = Math.min(12, pdfHeight * 0.3);
			const textWidth = font.widthOfTextAtSize(stamp.text, fontSize);
            
			// テキストの背景位置を計算（四角の上に配置）
			const textX = pdfX + pdfWidth / 2 - textWidth / 2;
			const textY = pdfY + pdfHeight + fontSize + 4;
			const textBgWidth = textWidth + 8;
			const textBgHeight = fontSize + 4;
            
			// テキストの背景を描画
			this.drawTextBackground(page, textX - 4, textY - 2, textBgWidth, textBgHeight, blueColor);
            
			// テキストを描画
			this.safeDrawText(page, stamp.text, {
				x: textX,
				y: textY,
				size: fontSize,
				font: font,
				color: blueColor,
			});
		}
	}

	// PDFファイルをダウンロード
	downloadPdfFile(pdfBytes, fileName) {
		const blob = new Blob([pdfBytes], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// === エラーハンドリング関数 ===
	// PDFで使用できない文字を除去
	sanitizeTextForPDF(text) {
		if (!text) return '';
        
		// WinAnsiでエンコードできない文字を除去
		// 基本的なASCII文字（0x20-0x7E）と一部の拡張文字（0x80-0xFF）のみを保持
		return text.replace(/[^\x20-\x7E\x80-\xFF]/g, '');
	}
    
	// エラーハンドリング付きテキスト描画
	safeDrawText(page, text, options) {
		try {
			const sanitizedText = this.sanitizeTextForPDF(text);
			if (sanitizedText.length === 0) {
				console.warn('テキストが完全に除去されました:', text);
				return;
			}
            
			if (sanitizedText !== text) {
				console.warn('WinAnsiエンコーディング対応でテキストを調整:', 
					`"${text}" -> "${sanitizedText}"`);
			}
            
			page.drawText(sanitizedText, options);
		} catch (error) {
			if (error.message && error.message.includes('WinAnsi cannot encode')) {
				console.error('WinAnsiエンコーディングエラー:', error.message);
				console.warn('問題のあるテキストをスキップします:', text);
			} else {
				console.error('テキスト描画エラー:', error);
				throw error; // WinAnsi以外のエラーは再スロー
			}
		}
	}
}

