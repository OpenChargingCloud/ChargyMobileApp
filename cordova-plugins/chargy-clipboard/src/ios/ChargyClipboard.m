#import <UIKit/UIKit.h>

#import "ChargyClipboard.h"

@implementation ChargyClipboard

- (void)readText:(CDVInvokedUrlCommand*)command
{
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString* text = [UIPasteboard generalPasteboard].string;
        CDVPluginResult* result;

        if (text.length > 0) {
            result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                                       messageAsString:text];
        } else {
            result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR
                                       messageAsString:@"The clipboard does not contain text."];
        }

        [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
    });
}

@end
