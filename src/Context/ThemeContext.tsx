/**
 * 主题上下文管理
 * 
 * 提供深色模式、浅色模式和跟随系统的主题切换功能。
 * 
 * @component ThemeContext
 * @description 主题管理上下文 - 管理应用主题状态和系统主题监听
 * @author YanRain ToolBox Team
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// 主题类型定义
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// 主题上下文接口
interface ThemeContextType {
    /** 当前主题模式 */
    theme: ThemeMode;
    /** 解析后的主题（实际显示的主题） */
    resolvedTheme: ResolvedTheme;
    /** 设置主题模式 */
    setTheme: (theme: ThemeMode) => void;
    /** 是否正在跟随系统主题 */
    isSystemTheme: boolean;
}

// 创建主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 本地存储键
const THEME_STORAGE_KEY = 'yanrain-toolbox-theme';

// 获取系统主题偏好
const getSystemTheme = (): ResolvedTheme => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

// 从本地存储获取保存的主题设置
const getSavedTheme = (): ThemeMode => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
            return saved;
        }
    }
    return 'system'; // 默认跟随系统
};

// 应用主题到 DOM
const applyTheme = (resolvedTheme: ResolvedTheme) => {
    if (typeof document !== 'undefined') {
        const root = document.documentElement;
        if (resolvedTheme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        console.log('Applied theme:', resolvedTheme, 'DOM classes:', root.classList.toString());

        // 强制重新渲染样式
        requestAnimationFrame(() => {
            document.body.style.display = 'none';
            document.body.offsetHeight; // 触发重排
            document.body.style.display = '';
        });
    }
};

// 主题提供者属性
interface ThemeProviderProps {
    children: ReactNode;
}

/**
 * 主题提供者组件
 * 
 * @param props - 组件属性
 * @returns React 组件
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemeMode>(getSavedTheme);
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

    // 计算解析后的主题
    const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;
    const isSystemTheme = theme === 'system';

    // 初始化时应用主题
    useEffect(() => {
        applyTheme(resolvedTheme);
    }, []);

    // 设置主题并保存到本地存储
    const setTheme = (newTheme: ThemeMode) => {
        setThemeState(newTheme);
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    };

    // 监听系统主题变化
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e: MediaQueryListEvent) => {
            setSystemTheme(e.matches ? 'dark' : 'light');
        };

        // 添加监听器
        mediaQuery.addEventListener('change', handleChange);

        // 初始化系统主题
        setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);

    // 应用主题到 DOM
    useEffect(() => {
        applyTheme(resolvedTheme);
    }, [resolvedTheme]);

    const contextValue: ThemeContextType = {
        theme,
        resolvedTheme,
        setTheme,
        isSystemTheme,
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
};

/**
 * 使用主题的 Hook
 * 
 * @returns 主题上下文对象
 */
export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;