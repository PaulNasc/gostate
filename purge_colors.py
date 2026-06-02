import os
import re

directories = ['frontend/src', 'admin/src', 'frontend/index.html', 'admin/index.html']
replacements = {
    'purple': 'teal',
    'violet': 'cyan',
    '#7C3AED': '#0891B2', # cyan-600
    '#8B5CF6': '#06B6D4', # cyan-500
    '#A78BFA': '#22D3EE', # cyan-400
    '#a78bfa': '#22d3ee',
    '#7c3aed': '#0891b2',
    '#8b5cf6': '#06b6d4',
}

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for old, new in replacements.items():
            new_content = new_content.replace(old, new)
            
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
    return False

modified_files = 0
for d in directories:
    if os.path.isfile(d):
        if replace_in_file(d):
            modified_files += 1
            print(f"Modified {d}")
    elif os.path.isdir(d):
        for root, dirs, files in os.walk(d):
            for file in files:
                if file.endswith(('.tsx', '.ts', '.css', '.html', '.js', '.jsx')):
                    filepath = os.path.join(root, file)
                    if replace_in_file(filepath):
                        modified_files += 1
                        print(f"Modified {filepath}")

print(f"Done. Modified {modified_files} files.")
