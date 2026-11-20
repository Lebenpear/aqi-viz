"""把阿里云 100000_full.json 拆成两张地图：
   1) china_main.json  —— 34 个省级行政区，其中海南省只保留北纬 17° 以北的部分（海南岛）
   2) china_south.json —— 九段线 + 海南省在北纬 17° 以南的岛礁（南海诸岛附图）
   目的：南海诸岛纬度低到 3.4°N，若与大陆同图，外接矩形被拉高近一倍，陆地被压成一小团。
        拆开后主图可以正常使用 center/zoom，附图保留地图完整性。
"""
import json

SRC = 'vendor/china.json'
OUT_MAIN = 'vendor/china_main.json'
OUT_SOUTH = 'vendor/china_south.json'
LAT_SPLIT = 17.0


def polys_of(geom):
    """统一取出 polygon 列表，每项是 [ring, ...]，ring 是 [ [lon,lat], ... ]"""
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    return list(geom['coordinates'])


def max_lat(poly):
    return max(pt[1] for ring in poly for pt in ring)


def main():
    g = json.load(open(SRC, encoding='utf-8'))
    main_feats, south_feats = [], []

    for f in g['features']:
        p = f.get('properties') or {}
        if p.get('adcode') == '100000_JD':
            south_feats.append(f)          # 九段线整体进附图
            continue

        if p.get('name') != '海南省':
            main_feats.append(f)
            continue

        # 海南省：按每个多边形的最高纬度切分
        north, south = [], []
        for poly in polys_of(f['geometry']):
            (north if max_lat(poly) >= LAT_SPLIT else south).append(poly)

        if north:
            main_feats.append({
                'type': 'Feature', 'properties': p,
                'geometry': {'type': 'MultiPolygon', 'coordinates': north}
            })
        if south:
            south_feats.append({
                'type': 'Feature',
                'properties': {'name': '南海诸岛', 'adcode': '100000_JD_ISL', 'level': None},
                'geometry': {'type': 'MultiPolygon', 'coordinates': south}
            })

    json.dump({'type': 'FeatureCollection', 'features': main_feats},
              open(OUT_MAIN, 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump({'type': 'FeatureCollection', 'features': south_feats},
              open(OUT_SOUTH, 'w', encoding='utf-8'), ensure_ascii=False)

    # 打印实际边界，便于确认主图范围
    def bbox(feats):
        xs, ys = [], []
        for f in feats:
            for poly in polys_of(f['geometry']):
                for ring in poly:
                    for x, y in ring:
                        xs.append(x); ys.append(y)
        return round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)

    print('main  features', len(main_feats), 'bbox', bbox(main_feats))
    print('south features', len(south_feats), 'bbox', bbox(south_feats))


if __name__ == '__main__':
    main()
