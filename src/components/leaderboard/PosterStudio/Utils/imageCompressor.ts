export async function compressImage(
  file: File | Blob,
  maxWidth: number = 2048,
  maxHeight: number = 2048,
  quality: number = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let { width, height } = img;
        
        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(file as File); // fallback if canvas is not supported
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const originalName = (file instanceof File) ? file.name : 'image.jpg';
              const newFile = new File(
                [blob], 
                originalName.replace(/\.[^/.]+$/, "") + ".jpg", 
                { type: 'image/jpeg', lastModified: Date.now() }
              );
              resolve(newFile);
            } else {
              resolve(file as File); // fallback
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
