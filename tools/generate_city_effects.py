"""Bake turbulent cloud textures once; no runtime noise or filter work."""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'assets/profile-effects'
W,H = 768,512
Y,X = np.mgrid[0:H,0:W].astype(np.float32)

def noise(seed, sx, sy):
    rng = np.random.default_rng(seed)
    grid = rng.random((sy+1,sx+1),dtype=np.float32)
    xx=X/W*sx;yy=Y/H*sy
    ix=np.floor(xx).astype(int);iy=np.floor(yy).astype(int)
    fx=xx-ix;fy=yy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    return (grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy

def fog(seed, center, thickness):
    field=np.zeros_like(X)
    for octave,weight in enumerate([.47,.25,.14,.08,.04,.02]):
        field+=noise(seed+octave*137,3*2**octave,2*2**octave)*weight
    warp=noise(seed+951,7,4)-.5
    crest=center+.055*np.sin(X/W*np.pi*3.4+seed)+warp*.15
    envelope=np.exp(-((Y/H-crest)/(thickness*(.68+field)))**2)
    density=np.clip((field-.27)*2.5,0,1)**1.5
    edge=np.sin(np.pi*np.clip(X/W,0,1))**.45
    alpha=np.clip(envelope*density*edge*210,0,185).astype(np.uint8)
    pixels=np.zeros((H,W,4),dtype=np.uint8)
    pixels[:,:,:3]=np.stack([np.full_like(X,160)+field*47,np.full_like(X,184)+field*39,np.full_like(X,205)+field*30],axis=-1).astype(np.uint8)
    pixels[:,:,3]=alpha
    return Image.fromarray(pixels,'RGBA')

OUT.mkdir(parents=True,exist_ok=True)
for name,seed,center,thickness in [('far',231,.20,.085),('mid',483,.43,.095),('near',719,.64,.105)]:
    image=fog(seed,center,thickness)
    image.save(OUT/f'city-cloud-{name}.webp','WEBP',quality=78,method=6)
print('Baked three transparent cloud layers: 768x512, six noise octaves, soft edges.')
