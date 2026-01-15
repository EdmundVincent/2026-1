import { Utils } from '../utils/utils.js';
import { RagSearch } from '../api/rag-search.js';

/**
 * TextTranslation - テキスト翻訳管理クラス
 * 
 * 選択されたテキストの翻訳処理を統合管理する。
 * OpenAI API、RAG検索、カスタムプロンプトなどを活用して
 * 高品質な翻訳サービスを提供する。
 * 
 * 主要機能:
 * - 多言語翻訳対応（日→英、英→日）
 * - RAG（Retrieval-Augmented Generation）検索連携
 * - カスタムプロンプト設定
 * - 翻訳履歴管理
 * - OpenAI API統合
 * - エラーハンドリング・リトライ機能
 * - レスポンス正規化処理
 * 
 * 翻訳フロー:
 * 1. テキスト選択・抽出
 * 2. RAG検索による関連情報取得
 * 3. カスタムプロンプト適用
 * 4. OpenAI API呼び出し
 * 5. レスポンス正規化・表示
 */
export class TextTranslation {
  constructor(options = {}) {
    this.globalState = options.globalState; 
    this.bboxManager = options.bboxManager;
    this.ragTranslation = options.ragTranslation || null; // RAG翻訳インスタンス
    this.ragSearch = options.ragSearch || new RagSearch({ globalState: options.globalState }); // RAG検索インスタンス
    this.llm = options.llm || null; // LLMインスタンス（未使用でもOK）
    this.callbacks = options.callbacks || {};

    this.initElements();

    // カスタムプロンプトをローカルストレージから読み込み
    this.loadCustomPromptFromStorage();
    this.loadCustomNormalizePromptFromStorage();
  }

  initElements() {
    this.aiTranslationResultArea = document.getElementById('aiTranslationResult');
    this.outputTextArea = document.getElementById('outputText');

    this.retranslateButton = document.getElementById('retranslateButton');
    this.applyAiTranslationButton = document.getElementById('applyAiTranslationButton');

    // プロンプト編集要素
    this.editPromptButton = document.getElementById('editPromptButton');
    this.promptEditModal = document.getElementById('promptEditModal');
    this.closePromptModal = document.getElementById('closePromptModal');
    this.promptTextArea = document.getElementById('promptTextArea');
    this.resetPromptButton = document.getElementById('resetPromptButton');
    this.savePromptButton = document.getElementById('savePromptButton');

    this.normalizePromptTextArea = document.getElementById('normalizePromptTextArea');
    this.normalizePromptEditModal = document.getElementById('normalizePromptEditModal');
  }

  // === 共通ユーティリティメソッド ===
  _setButtonState(button, disabled, text = null) {
    if (button) { button.disabled = disabled; if (text) button.textContent = text; }
  }
  _setButtonsState(buttonStates) { buttonStates.forEach(({ button, disabled, text }) => { this._setButtonState(button, disabled, text); }); }
  _loadFromStorage(key, targetProperty, logMessage) {
    try { const saved = localStorage.getItem(key); if (saved) { this.globalState[targetProperty] = saved; } } catch(e){ console.error(`${key}の読み込み失敗`, e);} }
  _saveToStorage(key, value, logMessage) { try { localStorage.setItem(key, value); return true; } catch(e){ console.error(`${key}の保存失敗`, e); return false; } }
  _replaceTemplateVariables(template, replacements) { let result = template; Object.entries(replacements).forEach(([k,v])=>{ const re=new RegExp(`\\$\\{${k}\\}`,'g'); result=result.replace(re, v||'');}); return result; }
  _createSampleReplacements(samples){ const rep={}; for(let i=1;i<=5;i++){ rep[`samples.sample${i}_ja`]=samples[`sample${i}_ja`]||''; rep[`samples.sample${i}_en`]=samples[`sample${i}_en`]||'';} return rep; }

  _updateBboxForRetranslation(bboxId, newTargetText, translation) {
    const bboxData = this.bboxManager?.getBboxData(bboxId);
    if (bboxData) {
      bboxData.text = newTargetText;
      this.bboxManager.setBboxData(bboxId, bboxData);
    }
    this.globalState.bboxOriginalTexts.set(bboxId, newTargetText);
    this.globalState.bboxTranslations.set(bboxId, translation);
    this.bboxManager?.setBboxEditedTranslation(bboxId, translation);
  }

  async _executeRetranslation(newTargetText, bboxId) {
    // RAGキャッシュをクリア
    this.ragTranslation?.clearBboxRAGCache(bboxId);
    // 翻訳キャッシュもクリア
    this.clearTranslationCache(newTargetText);
    // 強制翻訳
    const translation = await this.translateText(newTargetText, true);
    this._updateBboxForRetranslation(bboxId, newTargetText, translation);
    this.callbacks.updateRightPreview?.();
    await this.callbacks.loadRAGSamples?.(newTargetText, bboxId, true);
    return translation;
  }

  _openModal(modal, textArea, template) { textArea.value = template; modal.style.display = 'flex'; textArea.focus(); }
  _closeModal(modal) { modal.style.display = 'none'; }
  _savePromptToStorage(prompt, templateProperty, storageKey, alertMessage){ if(!prompt.trim()){ alert('プロンプトが入力されていません'); return false;} this.globalState[templateProperty]=prompt; const saved=this._saveToStorage(storageKey, prompt, `カスタム${alertMessage}プロンプトを保存しました`); if(saved){ alert(`${alertMessage}プロンプトを保存しました。次回の${alertMessage}から新しいプロンプトが使用されます。`);} return saved; }

  // === プロンプト編集機能 ===
  openPromptEditModal(){ const currentTemplate = this.globalState.customPromptTemplate || this.getDefaultPromptTemplateWithPlaceholders(); this._openModal(this.promptEditModal, this.promptTextArea, currentTemplate); }
  closePromptEditModal(){ this._closeModal(this.promptEditModal); }
  saveCustomPrompt(){ const customPrompt = this.promptTextArea.value.trim(); if(this._savePromptToStorage(customPrompt,'customPromptTemplate','customPromptTemplate','翻訳')){ this.clearTranslationCache(); this.closePromptEditModal(); } }
  _resetPromptToDefault(textArea, getDefaultTemplate, confirmMessage){ if(confirm(confirmMessage)){ const def = getDefaultTemplate(); textArea.value = def; } }
  resetPromptToDefault(){ this._resetPromptToDefault(this.promptTextArea, ()=> this.getDefaultPromptTemplateWithPlaceholders(), 'プロンプトをデフォルトに戻しますか？'); }
  resetNormalizePromptToDefault(){ this._resetPromptToDefault(this.normalizePromptTextArea, ()=> this.getDefaultNormalizePromptTemplate('${targetText}'), '正規化プロンプトをデフォルトに戻しますか？'); }
  loadCustomPromptFromStorage(){ this._loadFromStorage('customPromptTemplate','customPromptTemplate','カスタムプロンプトを読み込みました'); }

  // === テキストの翻訳 ===
  async translateText(text, forceRefresh = false) {
    // キャッシュ
    if (!forceRefresh && this.globalState.translationCache.has(text)) {
      return this.globalState.translationCache.get(text);
    }

    // RAG検索
    let samplesObj = {};
    try {
      const searchResult = await this.ragSearch.performRAGSearch(text);
      if (searchResult) {
        // もとの抽出ロジックを使用
        samplesObj = this.ragTranslation?.extractSamples(searchResult) || {};
      }
    } catch (e) { console.warn('RAG検索失敗', e); }

    // プロンプト生成（バックエンド側で再構成されるが、カスタム時の互換のため送る）
    const prompt = this.createTranslationPrompt(text, samplesObj);

    // Python API 経由の翻訳
    const backendUrl = window.BACKEND_URL || 'http://localhost:8000';
    const resp = await fetch(`${backendUrl}/api/translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, prompt })
    });
    if (!resp.ok) { console.error('translate API failed'); return text; }
    const data = await resp.json();
    const translation = data.translation || text;

    // キャッシュ
    this.globalState.translationCache.set(text, translation);
    return translation;
  }

  // === バッチ翻訳（JS版のパターン適用） ===
  async translateBatch(texts, forceRefresh = false) {
    // 重複除去とキャッシュフィルタリング
    const uniqueTexts = [...new Set(texts)];
    const textsToTranslate = forceRefresh ? uniqueTexts : 
      uniqueTexts.filter(text => !this.globalState.translationCache.has(text));

    if (textsToTranslate.length === 0) {
      return texts.map(text => this.globalState.translationCache.get(text) || text);
    }
    
    try {
      const backendUrl = window.BACKEND_URL || 'http://localhost:8000';
      const resp = await fetch(`${backendUrl}/api/translate_batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: textsToTranslate })
      });
      
      if (!resp.ok) {
        console.warn('バッチ翻訳API失敗、個別実行にフォールバック');
        return await this.translateBatchFallback(texts, forceRefresh);
      }
      
      const data = await resp.json();
      const translations = data.translations || [];
      
      // 結果をキャッシュに保存
      textsToTranslate.forEach((text, index) => {
        if (translations[index]) {
          this.globalState.translationCache.set(text, translations[index]);
        }
      });
      
      // 元のテキスト順序で結果を返す
      return texts.map(text => this.globalState.translationCache.get(text) || text);
      
    } catch (error) {
      console.warn('バッチ翻訳エラー、個別実行にフォールバック:', error);
      return await this.translateBatchFallback(texts, forceRefresh);
    }
  }

  // バッチ翻訳フォールバック（並列個別翻訳）
  async translateBatchFallback(texts, forceRefresh = false) {
    const promises = texts.map(text => this.translateText(text, forceRefresh));
    return await Promise.all(promises);
  }

  createTranslationPrompt(targetText, samples) {
    if (this.globalState.customPromptTemplate) {
      return this._applyPromptTemplate(this.globalState.customPromptTemplate, targetText, samples);
    }
    return this.getDefaultPromptTemplate(targetText, samples);
  }

  getDefaultPromptTemplate(targetText, samples) {
    const template = `# 指示

以下の日本語テキストを英語に翻訳してください。
翻訳にあたっては、特に航空機整備や技術的な用語に対する正確性を重視してください。
翻訳の参考として、過去の翻訳サンプルを以下に示しています。
これらのサンプルを考慮し、整合性のある翻訳を行ってください。

# 翻訳対象のテキスト

\`${'${targetText}'}\`

# 参考翻訳サンプル

1. 日本語: \`${'${samples.sample1_ja}'}\`
   英語: \`${'${samples.sample1_en}'}\`
2. 日本語: \`${'${samples.sample2_ja}'}\`
   英語: \`${'${samples.sample2_en}'}\`
3. 日本語: \`${'${samples.sample3_ja}'}\`
   英語: \`${'${samples.sample3_en}'}\`
4. 日本語: \`${'${samples.sample4_ja}'}\`
   英語: \`${'${samples.sample4_en}'}\`
5. 日本語: \`${'${samples.sample5_ja}'}\`
   英語: \`${'${samples.sample5_en}'}\`

# 注意点
- 用語の一貫性を保ち、正確に翻訳すること。
- 原文の意味を忠実に反映すること。
- 航空機整備に関する技術用語は適切に訳すこと。
- 翻訳対象のテキストはOCRにより取得したものである。OCRのミスと考えられる部分はサンプルを参照して合理的な範囲内で適宜修正すること。
- 出力する翻訳結果はバッククオート等の記号で囲わず、テキスト本文のみを出力すること。

# 翻訳結果：
`;
    return this._applyPromptTemplate(template, targetText, samples);
  }

  // デフォルトボタン用：プレースホルダーをそのまま表示するバージョン
  getDefaultPromptTemplateWithPlaceholders() {
    return `# 指示

以下の日本語テキストを英語に翻訳してください。
翻訳にあたっては、特に航空機整備や技術的な用語に対する正確性を重視してください。
翻訳の参考として、過去の翻訳サンプルを以下に示しています。
これらのサンプルを考慮し、整合性のある翻訳を行ってください。

# 翻訳対象のテキスト

\`\$\{targetText\}\`

# 参考翻訳サンプル

1. 日本語: \`\$\{samples.sample1_ja\}\`
   英語: \`\$\{samples.sample1_en\}\`
2. 日本語: \`\$\{samples.sample2_ja\}\`
   英語: \`\$\{samples.sample2_en\}\`
3. 日本語: \`\$\{samples.sample3_ja\}\`
   英語: \`\$\{samples.sample3_en\}\`
4. 日本語: \`\$\{samples.sample4_ja\}\`
   英語: \`\$\{samples.sample4_en\}\`
5. 日本語: \`\$\{samples.sample5_ja\}\`
   英語: \`\$\{samples.sample5_en\}\`

# 注意点
- 用語の一貫性を保ち、正確に翻訳すること。
- 原文の意味を忠実に反映すること。
- 航空機整備に関する技術用語は適切に訳すこと。
- 翻訳対象のテキストはOCRにより取得したものである。OCRのミスと考えられる部分はサンプルを参照して合理的な範囲内で適宜修正すること。
- 出力する翻訳結果はバッククオート等の記号で囲わず、テキスト本文のみを出力すること。

# 翻訳結果：
`;
  }

  _applyPromptTemplate(template, targetText, samples) {
    const replacements = { targetText, ...this._createSampleReplacements(samples) };
    return this._replaceTemplateVariables(template, replacements);
  }

  async retranslateFromTargetText(newTargetText) {
    if (!newTargetText.trim()) { this.aiTranslationResultArea.value=''; this.outputTextArea.value=''; return; }
    const bboxId = this.globalState.selectedOCRBox.bboxId;
    this._setButtonsState([{button:this.retranslateButton, disabled:true, text:'⏳'},{button:this.applyAiTranslationButton, disabled:true}]);
    this.aiTranslationResultArea.value = '翻訳中...';
    try{
      const translation = await this._executeRetranslation(newTargetText, bboxId);
      this.aiTranslationResultArea.value = translation; this.outputTextArea.value = translation; this._setButtonState(this.applyAiTranslationButton, false);
    }catch(err){ console.error('再翻訳エラー:', err); this.aiTranslationResultArea.value='翻訳に失敗しました'; this._setButtonState(this.applyAiTranslationButton, true);} finally{ this._setButtonState(this.retranslateButton, false, '🔄'); }
  }

  clearTranslationCache(text = null) { if (text) { this.globalState.translationCache.delete(text); } else { this.globalState.translationCache.clear(); } }

  // === 正規化 ===
  openNormalizePromptEditModal(){ const currentTemplate = this.globalState.customNormalizePromptTemplate || this.getDefaultNormalizePromptTemplate('${targetText}'); this._openModal(this.normalizePromptEditModal, this.normalizePromptTextArea, currentTemplate); }
  closeNormalizePromptEditModal(){ this._closeModal(this.normalizePromptEditModal); }
  saveCustomNormalizePrompt(){ const customPrompt = this.normalizePromptTextArea.value.trim(); if(this._savePromptToStorage(customPrompt,'customNormalizePromptTemplate','customNormalizePromptTemplate','正規化')){ this.closeNormalizePromptEditModal(); } }
  loadCustomNormalizePromptFromStorage(){ this._loadFromStorage('customNormalizePromptTemplate','customNormalizePromptTemplate','カスタム正規化プロンプトを読み込みました'); }

  async normalizeText(text){
    // サーバー側でプロンプト組み立てても良いが、互換のため送る
    const prompt = this.createNormalizePrompt(text);
    try{
      const backendUrl = window.BACKEND_URL || 'http://localhost:8000';
      const resp = await fetch(`${backendUrl}/api/normalize`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text, prompt })});
      if(!resp.ok){ return text; }
      const data = await resp.json();
      return data.normalized || text;
    }catch(e){ console.error('normalize API error', e); return text; }
  }

  createNormalizePrompt(targetText){ if(this.globalState.customNormalizePromptTemplate){ return this._replaceTemplateVariables(this.globalState.customNormalizePromptTemplate, { targetText }); } return this.getDefaultNormalizePromptTemplate(targetText); }
  getDefaultNormalizePromptTemplate(targetText){ return `# 指示

対象テキストを以下のルールにしたがって修正してください。  
特に航空機整備や技術的な用語に対する正確性を重視してください。

# ルール

1. 半角カタカナは全角カタカナに変換する。
2. 本来ひらがなや漢字で表記されるべき語句がカタカナで表記されているものについて、適切なひらがなや漢字に置き換える。ただし一般的にカタカナ表記される単語は変換しない。日本語に翻訳しない。
3. アルファベットや数字は変更せず保持する。
4. 航空機整備マニュアルや一般的な技術用語辞典に準拠する。
5. 出力は本文のみとし、余計な記号や説明を含めない。

# 対象テキスト

\`${targetText}\`


# 修正後テキスト：`; }
}
