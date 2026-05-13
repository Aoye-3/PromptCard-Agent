
def fix_escapes():
    """修复 TypeScript 文件中的转义字符问题"""
    with open('src/knowledge/vidprom-preset-options.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 修复 \" 为 "
    content = content.replace('\\"', '"')
    
    with open('src/knowledge/vidprom-preset-options.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("转义字符修复完成")

if __name__ == "__main__":
    fix_escapes()
