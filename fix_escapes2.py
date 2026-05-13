
def fix_escapes():
    """修复 TypeScript 文件中的转义字符问题"""
    try:
        # 尝试使用 utf-8 编码
        with open('src/knowledge/vidprom-preset-options.ts', 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # 尝试使用 gbk 编码
        with open('src/knowledge/vidprom-preset-options.ts', 'r', encoding='gbk') as f:
            content = f.read()
    except:
        # 尝试使用 latin-1 编码
        with open('src/knowledge/vidprom-preset-options.ts', 'r', encoding='latin-1') as f:
            content = f.read()
    
    # 修复 \" 为 "
    content = content.replace('\\"', '"')
    
    with open('src/knowledge/vidprom-preset-options.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("转义字符修复完成")

if __name__ == "__main__":
    fix_escapes()
