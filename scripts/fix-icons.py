from PIL import Image

def process(src, dst, thresh=235):
    im = Image.open(src).convert('RGB')
    gray = im.convert('L')
    bw = gray.point(lambda v: 255 if v > thresh else 0)
    inv = bw.point(lambda v: 255 - v)
    bbox = inv.getbbox()
    print(src, 'orig', im.size, 'bbox', bbox)
    if bbox:
        l, t, r, b = bbox
        pad = 24
        l = max(0, l - pad); t = max(0, t - pad)
        r = min(im.size[0], r + pad); b = min(im.size[1], b + pad)
        im = im.crop((l, t, r, b))
    w, h = im.size
    s = max(w, h)
    sq = Image.new('RGB', (s, s), 'white')
    sq.paste(im, ((s - w) // 2, (s - h) // 2))
    # white -> transparent
    sq = sq.convert('RGBA')
    px = sq.load()
    for y in range(s):
        for x in range(s):
            rr, gg, bb, aa = px[x, y]
            if rr > thresh and gg > thresh and bb > thresh:
                px[x, y] = (255, 255, 255, 0)
    sq.save(dst)
    print('saved', dst, sq.size)

process('src/public/images/icon-gazebo.png', 'src/public/images/icon-gazebo.png')
process('src/public/images/icon-tent.jpg', 'src/public/images/icon-tent.png')
print('done')
