#import <UIKit/UIKit.h>

#import "ChargyClipboard.h"

@interface ChargyClipboard ()

- (void)loadKnownDataFromProviders:(NSArray<NSItemProvider*>*)providers
                      providerIndex:(NSUInteger)providerIndex
                          typeIndex:(NSUInteger)typeIndex
                            command:(CDVInvokedUrlCommand*)command;
- (void)loadFileURLFromProviders:(NSArray<NSItemProvider*>*)providers
                    providerIndex:(NSUInteger)providerIndex
                          command:(CDVInvokedUrlCommand*)command;

@end

@implementation ChargyClipboard

- (NSArray<NSDictionary<NSString*, NSString*>*>*)supportedTypes
{
    return @[
        @{ @"identifier": @"com.adobe.pdf",     @"mimeType": @"application/pdf", @"extension": @"pdf"  },
        @{ @"identifier": @"public.json",       @"mimeType": @"application/json", @"extension": @"json" },
        @{ @"identifier": @"public.xml",        @"mimeType": @"application/xml",  @"extension": @"xml"  },
        @{ @"identifier": @"public.png",        @"mimeType": @"image/png",        @"extension": @"png"  },
        @{ @"identifier": @"public.jpeg",       @"mimeType": @"image/jpeg",       @"extension": @"jpg"  },
        @{ @"identifier": @"public.svg-image",  @"mimeType": @"image/svg+xml",    @"extension": @"svg"  }
    ];
}

- (NSString*)mimeTypeForFileName:(NSString*)fileName
{
    NSString* extension = fileName.pathExtension.lowercaseString;
    NSDictionary<NSString*, NSString*>* mimeTypes = @{
        @"bz2":  @"application/x-bzip2",
        @"gz":   @"application/gzip",
        @"jpeg": @"image/jpeg",
        @"jpg":  @"image/jpeg",
        @"json": @"application/json",
        @"ocmf": @"text/plain",
        @"pdf":  @"application/pdf",
        @"pem":  @"text/plain",
        @"png":  @"image/png",
        @"svg":  @"image/svg+xml",
        @"tar":  @"application/x-tar",
        @"txt":  @"text/plain",
        @"xml":  @"application/xml",
        @"zip":  @"application/zip"
    };

    return mimeTypes[extension] ?: @"application/octet-stream";
}

- (NSString*)fileNameForProvider:(NSItemProvider*)provider
                       extension:(NSString*)extension
{
    NSString* fileName = provider.suggestedName.lastPathComponent;
    if (fileName.length == 0)
        return [@"clipboard" stringByAppendingPathExtension:extension];

    if (fileName.pathExtension.length == 0)
        return [fileName stringByAppendingPathExtension:extension];

    return fileName;
}

- (void)sendError:(NSString*)message command:(CDVInvokedUrlCommand*)command
{
    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR
                                                messageAsString:message];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)sendText:(NSString*)text command:(CDVInvokedUrlCommand*)command
{
    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                                           messageAsDictionary:@{
                                               @"kind": @"text",
                                               @"text": text
                                           }];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)sendFileData:(NSData*)data
             fileName:(NSString*)fileName
             mimeType:(NSString*)mimeType
              command:(CDVInvokedUrlCommand*)command
{
    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                                           messageAsDictionary:@{
                                               @"kind": @"file",
                                               @"base64": [data base64EncodedStringWithOptions:0],
                                               @"fileName": fileName,
                                               @"mimeType": mimeType
                                           }];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)readTextFromPasteboard:(UIPasteboard*)pasteboard
                        command:(CDVInvokedUrlCommand*)command
{
    if (!pasteboard.hasStrings) {
        [self sendError:@"The clipboard does not contain supported text or file data."
                 command:command];
        return;
    }

    NSString* text = pasteboard.string;
    if (text.length > 0)
        [self sendText:text command:command];
    else
        [self sendError:@"The clipboard text is empty or paste access was denied."
                 command:command];
}

- (void)loadKnownDataFromProviders:(NSArray<NSItemProvider*>*)providers
                      providerIndex:(NSUInteger)providerIndex
                          typeIndex:(NSUInteger)typeIndex
                            command:(CDVInvokedUrlCommand*)command
{
    NSArray<NSDictionary<NSString*, NSString*>*>* supportedTypes = self.supportedTypes;
    if (providerIndex >= providers.count) {
        [self loadFileURLFromProviders:providers providerIndex:0 command:command];
        return;
    }

    if (typeIndex >= supportedTypes.count) {
        [self loadKnownDataFromProviders:providers
                           providerIndex:providerIndex + 1
                               typeIndex:0
                                 command:command];
        return;
    }

    NSItemProvider* provider = providers[providerIndex];
    NSDictionary<NSString*, NSString*>* type = supportedTypes[typeIndex];
    NSString* identifier = type[@"identifier"];

    if (![provider hasItemConformingToTypeIdentifier:identifier]) {
        [self loadKnownDataFromProviders:providers
                           providerIndex:providerIndex
                               typeIndex:typeIndex + 1
                                 command:command];
        return;
    }

    [provider loadDataRepresentationForTypeIdentifier:identifier
                                     completionHandler:^(NSData* data, NSError* error) {
        if (data.length > 0 && error == nil) {
            NSString* fileName = [self fileNameForProvider:provider extension:type[@"extension"]];
            [self sendFileData:data
                      fileName:fileName
                      mimeType:type[@"mimeType"]
                       command:command];
            return;
        }

        [self loadKnownDataFromProviders:providers
                           providerIndex:providerIndex
                               typeIndex:typeIndex + 1
                                 command:command];
    }];
}

- (NSURL*)fileURLFromProviderItem:(id<NSSecureCoding>)item
{
    id object = item;
    if ([object isKindOfClass:NSURL.class])
        return (NSURL*)object;

    NSString* value = nil;
    if ([object isKindOfClass:NSString.class])
        value = (NSString*)object;
    else if ([object isKindOfClass:NSData.class])
        value = [[NSString alloc] initWithData:(NSData*)object encoding:NSUTF8StringEncoding];

    return value.length > 0 ? [NSURL URLWithString:value] : nil;
}

- (void)loadFileURLFromProviders:(NSArray<NSItemProvider*>*)providers
                    providerIndex:(NSUInteger)providerIndex
                          command:(CDVInvokedUrlCommand*)command
{
    if (providerIndex >= providers.count) {
        [self readTextFromPasteboard:UIPasteboard.generalPasteboard command:command];
        return;
    }

    NSItemProvider* provider = providers[providerIndex];
    NSString* fileURLType = @"public.file-url";
    if (![provider hasItemConformingToTypeIdentifier:fileURLType]) {
        [self loadFileURLFromProviders:providers
                         providerIndex:providerIndex + 1
                               command:command];
        return;
    }

    [provider loadItemForTypeIdentifier:fileURLType
                                options:nil
                      completionHandler:^(id<NSSecureCoding> item, NSError* error) {
        NSURL* url = error == nil ? [self fileURLFromProviderItem:item] : nil;
        if (url.isFileURL) {
            BOOL accessed = [url startAccessingSecurityScopedResource];
            NSError* readError = nil;
            NSData* data = [NSData dataWithContentsOfURL:url options:0 error:&readError];
            if (accessed)
                [url stopAccessingSecurityScopedResource];

            if (data.length > 0 && readError == nil) {
                NSString* fileName = url.lastPathComponent.length > 0
                    ? url.lastPathComponent
                    : @"clipboard.bin";
                [self sendFileData:data
                          fileName:fileName
                          mimeType:[self mimeTypeForFileName:fileName]
                           command:command];
                return;
            }
        }
        else if (url.absoluteString.length > 0) {
            [self sendText:url.absoluteString command:command];
            return;
        }

        [self loadFileURLFromProviders:providers
                         providerIndex:providerIndex + 1
                               command:command];
    }];
}

- (void)readText:(CDVInvokedUrlCommand*)command
{
    dispatch_async(dispatch_get_main_queue(), ^{
        NSArray<NSItemProvider*>* providers = UIPasteboard.generalPasteboard.itemProviders;
        [self loadKnownDataFromProviders:providers
                           providerIndex:0
                               typeIndex:0
                                 command:command];
    });
}

@end
