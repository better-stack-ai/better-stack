import * as React from "react"
import type { Editor } from "@tiptap/react"
import type { ComponentType } from "react"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"

interface ImageEditBlockProps {
  editor: Editor
  close: () => void
  /** Optional trigger for a media library picker. When provided, rendered as a "Browse media" section. */
  imagePickerTrigger?: ComponentType<{ onSelect: (url: string) => void }>
}

export const ImageEditBlock: React.FC<ImageEditBlockProps> = ({
  editor,
  close,
  imagePickerTrigger: ImagePickerTrigger,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [link, setLink] = React.useState("")

  const handleClick = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return

      const insertImages = async () => {
        const contentBucket = []
        const filesArray = Array.from(files)

        for (const file of filesArray) {
          contentBucket.push({ src: file })
        }

        editor.commands.setImages(contentBucket)
      }

      await insertImages()
      close()
    },
    [editor, close]
  )

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      e.stopPropagation()

      if (link) {
        editor.commands.setImages([{ src: link }])
        close()
      }
    },
    [editor, link, close]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="image-link">Attach an image link</Label>
        <div className="flex">
          <Input
            id="image-link"
            type="url"
            required
            placeholder="https://example.com"
            value={link}
            className="grow"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLink(e.target.value)
            }
          />
          <Button type="submit" className="ml-2">
            Submit
          </Button>
        </div>
      </div>
      <Button type="button" className="w-full" onClick={handleClick}>
        Upload from your computer
      </Button>
      {ImagePickerTrigger && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Or browse media library
            </Label>
            <ImagePickerTrigger
              onSelect={(url) => {
                editor.commands.setImages([{ src: url }])
                close()
              }}
            />
          </div>
        </>
      )}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={handleFile}
      />
    </form>
  )
}

export default ImageEditBlock
