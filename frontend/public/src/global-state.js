/**
 * グローバル状態管理クラス
 * =======================
 * 
 * アプリケーション全体で共有される状態を一元管理する。
 * 翻訳プロセス、PDF表示、OCR結果、ユーザー操作状態を含む。
 */

export class GlobalState {
  constructor() {
    // 翻訳設定
    this.translationConfig = translationConfig;
    
    // PDF関連状態
    this.pdfDoc = null;              // PDF.jsドキュメントオブジェクト
    this.ocrData = null;             // OCR解析結果データ
    this.originalPdfFile = null;     // アップロードされた元PDFファイル
    this.currentPage = 1;            // 現在表示中のページ番号
    this.totalPages = 0;             // PDF総ページ数
    
    // 編集モード状態
    this.isAddTranslationMode = false;    // 翻訳追加モードフラグ
    this.isDeleteTranslationMode = false; // 翻訳削除モードフラグ
    
    // OCRボックス管理（Map: bboxId -> データ）
    this.bboxData = new Map();               // OCRボックスの基本データ
    this.bboxTranslations = new Map();       // 翻訳結果
    this.bboxEditedTranslations = new Map(); // ユーザー編集済み翻訳
    this.deletedBboxes = new Set();          // 削除されたボックスID
    this.bboxWrapSettings = new Map();       // テキスト折り返し設定
    this.bboxFontSizes = new Map();          // フォントサイズ設定
    this.bboxWidths = new Map();             // ボックス幅設定
    this.bboxConfirmationStatus = new Map(); // 翻訳確定状態
    
    // 選択・編集状態
    this.selectedOCRBox = null;        // 現在選択中のOCRボックス
    this.selectedBboxIds = new Set();  // 複数選択されたボックスID
    this.customBboxCounter = 0;        // カスタムボックス連番カウンタ
    this.customBboxIds = new Set();    // カスタム作成ボックスID一覧
    
    // 表示・スケール設定
    this.scale = 1.0;                  // 現在の表示倍率
    this.defaultScale = this.scale;    // デフォルト倍率
    this.minScale = 0.25;              // 最小倍率
    this.maxScale = 5.0;               // 最大倍率
    this.scaleStep = 0.25;             // 倍率変更ステップ
    
    // スタンプ機能状態
    this.isStampMode = false;          // スタンプモードフラグ
    this.canvasStamps = [];            // 配置済みスタンプ一覧
    this.isFirstClickDone = false;     // スタンプ配置用：最初のクリック完了フラグ
    this.firstClickX = 0;              // スタンプ配置用：最初のクリック座標X
    this.firstClickY = 0;              // スタンプ配置用：最初のクリック座標Y
    this.currentStampOverlay = null;   // 現在配置中のスタンプオーバーレイ
    
    // キャッシュ・最適化
    this.translationCache = new Map(); // 翻訳結果キャッシュ
    
    // カスタムプロンプト
    this.customPromptTemplate = null;           // カスタム翻訳プロンプトテンプレート
    this.customNormalizePromptTemplate = null;  // カスタム正規化プロンプトテンプレート
    
    // OCR元テキスト保存
    this.bboxOriginalTexts = new Map(); // 編集前の元OCRテキスト保存用
  }
  
  /**
   * 状態値を安全に設定する
   * @param {string} k - プロパティキー
   * @param {*} v - 設定値
   */
  setState(k, v) { 
    if (Object.prototype.hasOwnProperty.call(this, k) && this[k] !== v) {
      this[k] = v; 
    }
  }
}
