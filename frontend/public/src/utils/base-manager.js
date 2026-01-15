export class BaseManager {
    /**
     * ボタンの状態を切り替える（統一版）
     */
    static toggleButtonState(button, isActive, texts = {}) {
        if (!button) return;
        
        if (isActive) {
            button.classList.add('active');
            if (texts.active) button.textContent = texts.active;
        } else {
            button.classList.remove('active');
            if (texts.inactive) button.textContent = texts.inactive;
        }
    }

    /**
     * 複数ボタンの状態を一括設定
     */
    static setButtonsDisabled(context, buttonStateMap) {
        for (const [buttonName, disabled] of Object.entries(buttonStateMap)) {
            if (context[buttonName]) {
                context[buttonName].disabled = disabled;
            }
        }
    }

    /**
     * カーソル状態を設定する（統一版）
     */
    static setCursorState(element, cursorType = 'default') {
        if (!element) return;
        element.style.cursor = cursorType;
    }

    /**
     * コンテナのクラス状態を制御
     */
    static toggleContainerClass(container, className, isActive) {
        if (!container) return;
        
        if (isActive) {
            container.classList.add(className);
        } else {
            container.classList.remove(className);
        }
    }

    /**
     * モード切り替えの共通処理
     */
    static setModeUI(options = {}) {
        const { 
            button, 
            container, 
            containerClass, 
            isActive, 
            texts = {},
            cursor,
            cursorElement
        } = options;

        // ボタン状態の更新
        this.toggleButtonState(button, isActive, texts);
        
        // コンテナクラスの更新
        if (container && containerClass) {
            this.toggleContainerClass(container, containerClass, isActive);
        }

        // カーソル状態の更新
        if (cursorElement && cursor) {
            this.setCursorState(cursorElement, isActive ? cursor : 'default');
        }
    }

    /**
     * ボタンのテキストと状態を一時的に変更（処理中表示用）
     */
    static setButtonProcessing(button, processingText = '処理中...') {
        if (!button) return;
        
        const originalState = {
            disabled: button.disabled,
            textContent: button.textContent
        };
        
        button.disabled = true;
        button.textContent = processingText;
        
        return originalState;
    }

    /**
     * ボタンの状態を復元
     */
    static restoreButtonState(button, originalState) {
        if (!button || !originalState) return;
        
        button.disabled = originalState.disabled;
        button.textContent = originalState.textContent;
    }
}
