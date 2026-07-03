#import <Cordova/CDVPlugin.h>

@interface ChargyClipboard : CDVPlugin

- (void)readText:(CDVInvokedUrlCommand*)command;

@end
