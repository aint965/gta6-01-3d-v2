export const mat4=()=>new Float32Array(16);
export function identity(o){o.fill(0);o[0]=o[5]=o[10]=o[15]=1;return o;}
export function multiply(o,a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)r[c*4+row]=a[row]*b[c*4]+a[4+row]*b[c*4+1]+a[8+row]*b[c*4+2]+a[12+row]*b[c*4+3];o.set(r);return o;}
export function perspective(o,fovy,aspect,near,far){const f=1/Math.tan(fovy/2);o.fill(0);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o;}
export function lookAt(o,e,c,u){let zx=e[0]-c[0],zy=e[1]-c[1],zz=e[2]-c[2],n=Math.hypot(zx,zy,zz);zx/=n;zy/=n;zz/=n;let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx;n=Math.hypot(xx,xy,xz);xx/=n;xy/=n;xz/=n;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;o[12]=-(xx*e[0]+xy*e[1]+xz*e[2]);o[13]=-(yx*e[0]+yy*e[1]+yz*e[2]);o[14]=-(zx*e[0]+zy*e[1]+zz*e[2]);o[15]=1;return o;}
