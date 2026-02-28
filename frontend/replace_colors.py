import os
import glob

replacements = {
    "#33FF00": "#00E5FF",
    "rgba(51, 255, 0,": "rgba(0, 229, 255,",
    "51, 255, 0": "0, 229, 255",
    "#22aa00": "#00b8cc",
    "#3cfc0d": "#33eeff",
    "#2bd600": "#00cccc",
    "Neon EV Green": "Neon EV Cyan",
    "neon-green-text": "neon-cyan-text"
}

files = glob.glob('src/**/*.css', recursive=True) + glob.glob('src/**/*.jsx', recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {file}")
