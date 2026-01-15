/**
 * Utils - 汎用ユーティリティクラス
 * 
 * アプリケーション全体で共通使用される便利機能を提供する静的クラス。
 * 文字列処理、言語判定、データ変換など、再利用可能な汎用機能を
 * 集約して保守性とコードの一貫性を向上させる。
 * 
 * 主要機能:
 * - 日本語文字判定（ひらがな・カタカナ・漢字）
 * - Unicode文字範囲検証
 * - テキスト正規化処理
 * - 言語固有の処理サポート
 * - 静的メソッドによる簡易アクセス
 * 
 * 文字コード範囲:
 * - ひらがな: U+3040-U+309F
 * - カタカナ: U+30A0-U+30FF
 * - 漢字(CJK): U+4E00-U+9FFF
 */
export class Utils {
    static containsJapanese(text) {
        // ひらがな、カタカナ、漢字（CJK統合漢字）を検出
        // \p{Hiragana}: ひらがな (U+3040-U+309F)
        // \p{Katakana}: カタカナ (U+30A0-U+30FF)
        // \p{Han}: 漢字 (CJK統合漢字 U+4E00-U+9FFF)
        const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
        return japaneseRegex.test(text);
    }
}
