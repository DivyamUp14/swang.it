# Images Folder

Place your downloaded images here.

## Required Payment Icons
Download and save these images with these exact filenames:

1. **visa-logo.png** - Visa logo
2. **amex-logo.png** - American Express logo  
3. **paypal-logo.png** - PayPal logo

## How to Add Images

1. Download the payment logos from official sources or use your own images
2. Save them in this folder: `client/src/assets/images/`
3. Use the exact filenames listed above
4. The images will automatically be imported in TopUpModal.jsx

## Image Specifications
- Format: PNG (recommended) or SVG
- Size: Recommended 200x200px or larger for logos
- Background: Transparent background preferred

## Usage in Code
Images are already imported in TopUpModal.jsx:
```jsx
import visaLogo from '../../assets/images/visa-logo.png';
import amexLogo from '../../assets/images/amex-logo.png';
import paypalLogo from '../../assets/images/paypal-logo.png';
```

Then used like:
```jsx
<img src={visaLogo} alt="Visa" className="h-8" />
```

## Adding More Images
To add more images to other components:
1. Place the image in this folder
2. Import it at the top of your component:
   ```jsx
   import myImage from '../../assets/images/my-image.png';
   ```
3. Use it in your JSX:
   ```jsx
   <img src={myImage} alt="Description" />
   ```
