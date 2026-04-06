import React from 'react';
import { cn } from '../../lib/utils';

const Button = React.forwardRef(({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    const variants = {
        primary: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
        outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 active:bg-gray-100',
        ghost: 'hover:bg-gray-100 text-gray-700',
        link: 'text-red-900 underline-offset-4 hover:underline',
    };

    const sizes = {
        default: 'h-12 px-4 py-2 text-base', // Tappable size
        sm: 'h-9 rounded-md px-3 text-sm',
        lg: 'h-14 rounded-md px-8 text-lg',
        icon: 'h-12 w-12',
    };

    return (
        <button
            className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                variants[variant],
                sizes[size],
                className
            )}
            ref={ref}
            {...props}
        />
    );
});
Button.displayName = 'Button';

export { Button };
