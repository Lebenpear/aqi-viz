"""把 JSON 数据同步成脚本版本，供 file:// 双击打开时使用。

用法（数据或地图更新后跑一次）：
    python build_web.py

输入：data/app_data.json、vendor/china_main.json、vendor/china_south.json
输出：data/app_data.js（window.APP_DATA）、vendor/geo.js（window.CHINA_MAIN / window.CHINA_SOUTH）
"""
import io
import json
import os


def dump_js(path, header, assigns):
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write('/* 自动生成，请勿手改：改动数据后执行 python build_web.py */\n')
        f.write(header + '\n')
        for name, obj in assigns:
            f.write('window.%s = ' % name)
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
            f.write(';\n')
    print('%-24s %5d KB' % (path, os.path.getsize(path) // 1024))


def main():
    data = json.load(open('data/app_data.json', encoding='utf-8'))
    main_geo = json.load(open('vendor/china_main.json', encoding='utf-8'))
    south_geo = json.load(open('vendor/china_south.json', encoding='utf-8'))

    dump_js('data/app_data.js',
            '// 与 app_data.json 内容一致',
            [('APP_DATA', data)])
    dump_js('vendor/geo.js',
            '// china_main.json + china_south.json（由 build_geo.py 拆分）',
            [('CHINA_MAIN', main_geo), ('CHINA_SOUTH', south_geo)])


if __name__ == '__main__':
    main()
