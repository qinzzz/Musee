import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    position="top-center"
    closeButton={false}
    toastOptions={{
      classNames: {
        toast:
          'group rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-neutral-900 shadow-xl backdrop-blur-md',
        title: 'text-[12px] font-medium leading-5',
        actionButton:
          'rounded-full bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-black',
      },
    }}
    {...props}
  />
);

export { Toaster };
