import React from 'react';

interface LinkHubLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  withTagline?: boolean;
}

export const LinkHubLogo: React.FC<LinkHubLogoProps> = ({
  size = 'md',
  className = '',
  withTagline = false,
}) => {
  const sizeConfig = {
    sm: {
      fontSize: 'text-[19px]',
      badgePad: 'px-[5px] py-[1.5px] rounded-[4px] ml-[2px]',
      tag: 'text-[9px]',
    },
    md: {
      fontSize: 'text-[22px] sm:text-[25px]',
      badgePad: 'px-[6px] py-[2px] rounded-[5px] ml-[2.5px]',
      tag: 'text-[10px]',
    },
    lg: {
      fontSize: 'text-[30px] sm:text-[34px]',
      badgePad: 'px-[8px] py-[2.5px] rounded-[6px] ml-[3px]',
      tag: 'text-xs',
    },
    xl: {
      fontSize: 'text-[38px] sm:text-[46px]',
      badgePad: 'px-[10px] py-[3px] rounded-[7px] ml-[4px]',
      tag: 'text-sm',
    },
  }[size];

  return (
    <div className={`inline-flex flex-col select-none ${className}`}>
      <div
        className={`inline-flex items-center font-extrabold tracking-[-0.03em] leading-none ${sizeConfig.fontSize}`}
        style={{
          fontFamily: '"Helvetica Neue", Arial, "Outfit", sans-serif',
        }}
      >
        <span className="text-white font-extrabold leading-none">Link</span>
        <span
          className={`bg-[#ff9000] text-black font-extrabold leading-none inline-flex items-center justify-center ${sizeConfig.badgePad}`}
        >
          hub
        </span>
      </div>
      {withTagline && (
        <span className={`${sizeConfig.tag} text-zinc-400 font-semibold tracking-wider uppercase mt-1`}>
          Private Vault
        </span>
      )}
    </div>
  );
};
