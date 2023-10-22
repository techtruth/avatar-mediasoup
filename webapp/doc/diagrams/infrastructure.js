/**
 * Infrastructure layout
 * @file
 * @mermaid
 *  C4Context
 *      UpdateLayoutConfig("layout", $c4Row="4")
 *      title Frame Service Architecture
 *      Enterprise_Boundary(b0, "Frame") {
 *          
 *        Boundary(infrastructure, "Cloud Infrastructure") {
 *
 *          Boundary(containerstorage, "Docker Container Registry", "AWS ECR") {
 *            Component(egressruntimestorage, "Repository egress")
 *            Component(ingressruntimestorage, "Repository ingress")
 *            Component(signalingruntimestorage, "Repository signaling")
 *            Component(authenticationruntimestorage, "Repository authentication")
 *          }
 *        
 *          Boundary(serverconfig , "Server Configurations", "AWS EC2 Launch Template") {
 *            Component(egressconfig, "Egress Config")
 *            Component(ingressconfig, "Ingress Config")
 *            Component(signalingconfig, "Signaling Config")
 *            Component(authenticationconfig, "Authentication Config")
 *            Rel(authenticationruntimestorage, authenticationconfig, "Docker Image")
 *            Rel(signalingruntimestorage, signalingconfig, "Docker Image")
 *            Rel(ingressruntimestorage, ingressconfig, "Docker Image")
 *            Rel(egressruntimestorage, egressconfig, "Docker Image")
 *          }
 *          
 *          Boundary(serverautoscale , "Server AutoScale", "AWS EC2 AutoScaling") {
 *            Component(egressautoscale, "Egress Autoscale")
 *            Rel(egressconfig, egressautoscale, "Launch Template")
 *          }
 *
 *          Boundary(serverinstance , "Server Instances", "AWS EC2 Instance") {
 *            Component(egressinstance1, "Egress Media Server #1")
 *            Component(egressinstance2, "Egress Media Server #2")
 *            Component(egressinstance3, "Egress Media Server #3")
 *            Component(ingressinstance, "Ingress Media Server")
 *            Component(signalinginstance, "Signaling Server")
 *            Component(authenticationinstance, "Authentication Server")
 *            Rel(signalingconfig, signalinginstance, "Launch from Template")
 *            Rel(ingressconfig, ingressinstance, "Launch from Template")
 *            Rel(egressautoscale, egressinstance1, "Launch from Autoscale")
 *            Rel(egressautoscale, egressinstance2, "Launch from Autoscale")
 *            Rel(egressautoscale, egressinstance3, "Launch from Autoscale")
 *            Rel(authenticationconfig, authenticationinstance, "Launch from Autoscale")
 *          }
 *            
 *          Boundary(webstorage, "Static Web Application", "AWS S3") {
 *            Component(mainlinestaticstorage, "Bucket framevr.io")
 *            Component(quickstaticstorage, "Bucket quick.framevr.io")
 *            Component(portalstaticstorage, "Bucket portal.framevr.io")
 *            Component(librarystaticstorage, "Bucket library.framevr.io")
 *            Rel(mainlinestaticstorage, mainlinedistribution, "Bucket")
 *            Rel(quickstaticstorage, quickdistribution, "Bucket")
 *            Rel(portalstaticstorage, portaldistribution, "Bucket")
 *            Rel(librarystaticstorage, librarydistribution, "Bucket")
 *          }
 *
 *          Boundary(webcdn, "Content Delivery Network", "AWS Cloudfront") {
 *            Component(mainlinedistribution, "Distribution framevr.io")
 *            Component(quickdistribution, "Distribution quick.framevr.io")
 *            Component(portaldistribution, "Distribution portal.framevr.io")
 *            Component(librarydistribution, "Distribution library.framevr.io")
 *            Rel(mainlinedistribution,mainlinedns, "A Record")
 *            Rel(quickdistribution,quickdns, "A Record")
 *            Rel(portaldistribution,portaldns, "A Record")
 *            Rel(librarydistribution,librarydns, "A Record")
 *          }
 *
 *          Boundary(dns, "DNS", "AWS Route53") {
 *            Component(apidns, "api.framevr.io")
 *            Component(authenticationdns, "i.framevr.io")
 *            Component(mainlinedns, "framevr.io")
 *            Component(quickdns, "quick.framevr.io")
 *            Component(portaldns, "portal.framevr.io")
 *            Component(librarydns, "library.framevr.io")
 *            Rel(apidns, signalinginstance, "A Record")
 *            Rel(authenticationdns, authenticationinstance, "A Record")
 *          }
 *        }
 *      }
 *
 *      Enterprise_Boundary(client, "Users") {
 *        Boundary(clientuseragent, "Browser") {
 *          Component(egress, "WebRTC Egress")
 *          Component(ingress, "WebRTC Ingress")
 *          Component(wss, "Websocket")
 *          Component(https, "Web/HTTP")
 *            Rel(https, mainlinedns, "HTTPS")
 *            Rel(https, quickdns, "HTTPS")
 *            Rel(https, portaldns, "HTTPS")
 *            Rel(https, librarydns, "HTTPS")
 *            Rel(https, authenticationdns, "HTTPS")
 *            Rel(wss, apidns, "WSS")
 *            Rel(egress, egressinstance1, "WebRTC")
 *            Rel(egress, egressinstance2, "WebRTC")
 *            Rel(ingress, ingressinstance, "WebRTC")
 *        }
 *      }
 *
 *      Enterprise_Boundary(externalinfrastructure, "Cloud Vendors") {
 *        Boundary(useruploadeddata, "File Storage", "Cloudinary") {
 *          Component(useruploadedassetsstorage, "User Uploaded Files")
 *            Rel(https, useruploadedassetsstorage, "HTTPS")
 *        }
 *        
 *        Boundary(userdatabase, "Database & Auth", "Firestore") {
 *          Component(userdatabaseauth, "User oAuth Authentication")
 *          Component(userdatabasegenerated, "User Generated Data")
 *          Rel(https, userdatabaseauth, "HTTPS")
 *          Rel(https, userdatabasegenerated, "HTTPS")
 *        }
 *        
 *        Boundary(networkstability, "Network Reachability", "Twilio") {
 *          Component(networkstability1, "STUN/TURN")
 *        }          
 *      }
 **/
