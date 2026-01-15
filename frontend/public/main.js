/**
 * ANA 整備ドキュメント翻訳アプリ - メインエントリーポイント
 * ========================================================
 * 
 * アプリケーションの初期化とコンポーネント統合を行う。
 * 
 * 主な責務：
 * - グローバル状態管理の初期化
 * - PDF翻訳コンポーネントの起動
 * - DOMコンテンツ読み込み完了後の処理開始
 * 
 * 技術仕様：
 * - バックエンドAPI: /api プレフィックスでアクセス
 * - アーキテクチャ: SPA (Single Page Application)
 */

import { TranslationPDFMaker } from "./src/translation-pdf-maker.js";
import { GlobalState } from './src/global-state.js';

// DOM読み込み完了後にアプリケーション開始
document.addEventListener('DOMContentLoaded', () => {
  const globalState = new GlobalState();
  new TranslationPDFMaker(globalState);
});
