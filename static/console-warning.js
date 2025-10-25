// Anti-self-XSS warning
(function() {
    const warning = `
%c⚠️ STOP! ⚠️
%cThis is a browser feature intended for developers. If someone told you to copy and paste something here, it is a scam and will give them access to your account or data.

%cSee https://en.wikipedia.org/wiki/Self-XSS for more information.
`;

    console.log(
        warning,
        'color: red; font-size: 40px; font-weight: bold;',
        'color: yellow; font-size: 20px;',
        'color: white; font-size: 14px;'
    );
})();
